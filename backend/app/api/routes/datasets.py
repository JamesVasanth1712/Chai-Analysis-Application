import io
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from app.api.deps import get_current_user, get_current_tenant
from app.core.database import get_db
from app.models.user import User
from app.models.tenant import Tenant
from app.models.dataset import Dataset
from app.tools.dataset_store import create_dataset_table, drop_dataset_table
import structlog

logger = structlog.get_logger()
router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post("/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    dashboard_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("csv", "xlsx", "xls", "json", "docx", "pdf", "parquet"):
        raise HTTPException(
            status_code=400,
            detail="Supported formats: CSV, Excel (XLSX/XLS), JSON, Word (DOCX), PDF, and Parquet"
        )

    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 50 MB limit")

    try:
        if ext == "csv":
            import csv
            text = contents.decode("utf-8-sig", errors="replace")
            reader = csv.DictReader(io.StringIO(text))
            column_names = reader.fieldnames or []
            rows = [dict(r) for r in reader]
        elif ext in ("xlsx", "xls"):
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
            ws = wb.active
            all_rows = list(ws.iter_rows(values_only=True))
            if not all_rows:
                raise HTTPException(status_code=400, detail="Empty spreadsheet")
            column_names = [str(c) if c is not None else f"col_{i}" for i, c in enumerate(all_rows[0])]
            rows = [dict(zip(column_names, r)) for r in all_rows[1:]]
        elif ext == "json":
            from app.utils.file_parser import parse_json
            column_names, rows = parse_json(contents)
        elif ext == "docx":
            from app.utils.file_parser import parse_docx
            column_names, rows = parse_docx(contents)
        elif ext == "pdf":
            from app.utils.file_parser import parse_pdf
            column_names, rows = parse_pdf(contents)
        elif ext == "parquet":
            import pandas as pd
            df = pd.read_parquet(io.BytesIO(contents))
            column_names = list(df.columns)
            # Replace nan/nat with None
            df = df.where(df.notnull(), None)
            rows = df.to_dict(orient="records")
            
        # Clean dataset (drop duplicates, impute missing values)
        from app.utils.file_parser import clean_dataset
        column_names, rows, clean_summary = clean_dataset(list(column_names), rows)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    dataset_name = name or filename.rsplit(".", 1)[0]
    dataset = Dataset(
        name=dataset_name,
        original_filename=filename,
        file_format=ext,
        row_count=len(rows),
        column_names=list(column_names),
        column_types={},
        table_name="",
        status="pending",
        tenant_id=current_tenant.id,
        created_by=current_user.id,
        dashboard_id=dashboard_id,
    )
    db.add(dataset)
    await db.commit()

    try:
        table_name, col_types, safe_cols = await create_dataset_table(rows, list(column_names))
        dataset.table_name = table_name
        dataset.column_types = col_types
        dataset.column_names = safe_cols
        dataset.status = "ready"
        await db.commit()
        logger.info(
            "dataset_uploaded",
            dataset_id=dataset.id,
            table=table_name,
            rows=len(rows),
            cleaning=clean_summary
        )
    except Exception as e:
        dataset.status = "failed"
        dataset.error_message = str(e)
        await db.commit()
        logger.error("dataset_upload_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to store dataset: {e}")

    return {
        "id": dataset.id,
        "name": dataset.name,
        "table_name": dataset.table_name,
        "row_count": dataset.row_count,
        "columns": dataset.column_names,
        "column_types": dataset.column_types,
        "status": dataset.status,
    }


@router.get("/")
async def list_datasets(
    dashboard_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    query = select(Dataset).where(Dataset.tenant_id == current_tenant.id)
    if dashboard_id:
        query = query.where(Dataset.dashboard_id == dashboard_id)
    result = await db.execute(query.order_by(Dataset.created_at.desc()).limit(100))
    datasets = result.scalars().all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "original_filename": d.original_filename,
            "file_format": d.file_format,
            "row_count": d.row_count,
            "columns": d.column_names,
            "column_types": d.column_types,
            "table_name": d.table_name,
            "status": d.status,
            "dashboard_id": d.dashboard_id,
            "created_at": d.created_at.isoformat(),
        }
        for d in datasets
    ]


@router.get("/{dataset_id}/preview")
async def preview_dataset(
    dataset_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.tenant_id == current_tenant.id)
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset.status != "ready":
        raise HTTPException(status_code=400, detail=f"Dataset not ready: {dataset.status}")

    from app.tools.sql_executor import sql_executor
    rows = await sql_executor.execute(
        f'SELECT * FROM "{dataset.table_name}"',
        limit=min(limit, 500),
    )
    return {
        "id": dataset.id,
        "name": dataset.name,
        "columns": dataset.column_names,
        "column_types": dataset.column_types,
        "rows": rows,
        "row_count": dataset.row_count,
        "table_name": dataset.table_name,
    }


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.tenant_id == current_tenant.id)
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if dataset.table_name:
        try:
            await drop_dataset_table(dataset.table_name)
        except Exception as e:
            logger.warning("drop_table_failed", table=dataset.table_name, error=str(e))

    await db.execute(delete(Dataset).where(Dataset.id == dataset_id))
    await db.commit()
    return {"ok": True, "id": dataset_id}


@router.get("/{dataset_id}/stats")
async def get_dataset_stats(
    dataset_id: str,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.tenant_id == current_tenant.id)
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset.status != "ready":
        raise HTTPException(status_code=400, detail="Dataset is not ready")

    from app.tools.sql_executor import sql_executor
    cols = dataset.column_names
    col_types = dataset.column_types
    table_name = dataset.table_name

    stats = []
    if not cols:
        return {
            "id": dataset.id,
            "name": dataset.name,
            "row_count": dataset.row_count,
            "columns": []
        }

    select_parts = []
    for c in cols:
        qc = f'"{c}"'
        select_parts.append(f'COUNT({qc}) AS "{c}_non_null"')
        select_parts.append(f'COUNT(DISTINCT {qc}) AS "{c}_unique"')
        
        ptype = col_types.get(c, "TEXT").upper()
        if any(t in ptype for t in ("INT", "DOUBLE", "PRECISION", "REAL", "NUMERIC", "FLOAT", "DECIMAL")):
            select_parts.append(f'MIN({qc}) AS "{c}_min"')
            select_parts.append(f'MAX({qc}) AS "{c}_max"')
            select_parts.append(f'AVG({qc}) AS "{c}_avg"')
        else:
            select_parts.append(f'NULL AS "{c}_min"')
            select_parts.append(f'NULL AS "{c}_max"')
            select_parts.append(f'NULL AS "{c}_avg"')

    query_sql = f'SELECT COUNT(*) AS total_rows, {", ".join(select_parts)} FROM "{table_name}"'
    try:
        rows = await sql_executor.execute(query_sql, limit=1)
        res_row = rows[0] if rows else {}
        total_rows = res_row.get("total_rows", dataset.row_count)
        
        for c in cols:
            non_null = res_row.get(f'{c}_non_null', 0)
            null_count = total_rows - non_null
            unique_count = res_row.get(f'{c}_unique', 0)
            c_min = res_row.get(f'{c}_min')
            c_max = res_row.get(f'{c}_max')
            c_avg = res_row.get(f'{c}_avg')
            
            stats.append({
                "column": c,
                "type": col_types.get(c, "TEXT"),
                "null_count": null_count,
                "null_percentage": round((null_count / total_rows) * 100, 2) if total_rows > 0 else 0,
                "unique_count": unique_count,
                "min": str(c_min) if c_min is not None else None,
                "max": str(c_max) if c_max is not None else None,
                "avg": round(c_avg, 4) if c_avg is not None else None
            })
    except Exception as e:
        logger.error("calculate_stats_failed", table=table_name, error=str(e))
        for c in cols:
            stats.append({
                "column": c,
                "type": col_types.get(c, "TEXT"),
                "null_count": 0,
                "null_percentage": 0,
                "unique_count": 0,
                "min": None,
                "max": None,
                "avg": None
            })

    return {
        "id": dataset.id,
        "name": dataset.name,
        "row_count": dataset.row_count,
        "columns": stats
    }


class CleanRequest(BaseModel):
    action: str  # drop_duplicates|fill_nulls|format_headers
    column: Optional[str] = None
    fill_value: Optional[str] = None


@router.post("/{dataset_id}/clean")
async def clean_dataset_endpoint(
    dataset_id: str,
    body: CleanRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    import re
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.tenant_id == current_tenant.id)
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset.status != "ready":
        raise HTTPException(status_code=400, detail="Dataset is not ready")

    from app.tools.sql_executor import sql_executor
    table_name = dataset.table_name

    try:
        if body.action == "drop_duplicates":
            await sql_executor.execute(f'CREATE OR REPLACE TABLE "{table_name}" AS SELECT DISTINCT * FROM "{table_name}"')
            count_res = await sql_executor.execute(f'SELECT COUNT(*) AS c FROM "{table_name}"')
            new_count = count_res[0]["c"] if count_res else dataset.row_count
            dataset.row_count = new_count
            await db.commit()
            return {"status": "success", "message": "Duplicates dropped successfully", "row_count": new_count}

        elif body.action == "fill_nulls":
            if not body.column:
                raise HTTPException(status_code=400, detail="Column is required for fill_nulls action")
            if body.column not in dataset.column_names:
                raise HTTPException(status_code=400, detail=f"Column '{body.column}' not found")
            
            val = body.fill_value or "0"
            col_type = dataset.column_types.get(body.column, "TEXT").upper()
            is_num = any(t in col_type for t in ("INT", "DOUBLE", "PRECISION", "REAL", "NUMERIC", "FLOAT", "DECIMAL"))
            
            if is_num:
                try:
                    val_typed = float(val)
                except ValueError:
                    val_typed = 0.0
                query = f'UPDATE "{table_name}" SET "{body.column}" = COALESCE("{body.column}", {val_typed})'
            else:
                escaped_val = val.replace("'", "''")
                query = f'UPDATE "{table_name}" SET "{body.column}" = COALESCE("{body.column}", \'{escaped_val}\')'
                
            await sql_executor.execute(query)
            return {"status": "success", "message": f"Nulls in column '{body.column}' filled with '{val}'"}

        elif body.action == "format_headers":
            old_cols = dataset.column_names
            new_cols = []
            rename_ops = []
            
            for c in old_cols:
                new_c = re.sub(r"[^\w]", "_", c.strip().lower())
                new_c = re.sub(r"_+", "_", new_c).strip("_")
                if not new_c:
                    new_c = f"col_{len(new_cols)}"
                if new_c in new_cols:
                    new_c = f"{new_c}_{len(new_cols)}"
                new_cols.append(new_c)
                if c != new_c:
                    rename_ops.append(f'ALTER TABLE "{table_name}" RENAME COLUMN "{c}" TO "{new_c}"')
            
            for op in rename_ops:
                await sql_executor.execute(op)
                
            updated_col_types = {}
            for old, new in zip(old_cols, new_cols):
                updated_col_types[new] = dataset.column_types.get(old, "TEXT")
                
            dataset.column_names = new_cols
            dataset.column_types = updated_col_types
            await db.commit()
            return {"status": "success", "message": "Headers formatted successfully", "columns": new_cols}
            
        else:
            raise HTTPException(status_code=400, detail="Invalid action specified")
            
    except Exception as e:
        logger.error("cleaning_failed", dataset_id=dataset_id, action=body.action, error=str(e))
        raise HTTPException(status_code=500, detail=f"Cleaning failed: {e}")
