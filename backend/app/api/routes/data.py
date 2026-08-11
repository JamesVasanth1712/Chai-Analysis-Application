import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.api.deps import get_current_user, get_current_tenant
from app.core.database import get_db
from app.models.user import User
from app.models.tenant import Tenant
from app.models.dataset import Dataset
from app.services.nl_to_sql import run_query, shape_for_chart
from app.core.config import settings
from app.services.llm_service import llm_service
import structlog

logger = structlog.get_logger()
router = APIRouter(prefix="/data", tags=["data"])


class ChartRequest(BaseModel):
    sql: Optional[str] = None
    nl_query: Optional[str] = None
    chart_type: str = "bar"  # line|bar|pie|area|table
    x_key: Optional[str] = None
    y_keys: Optional[List[str]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    db_url: Optional[str] = None
    dataset_table: Optional[str] = None
    limit: int = 500


class ExploreRequest(BaseModel):
    sql: Optional[str] = None
    nl_query: Optional[str] = None
    db_url: Optional[str] = None
    dataset_table: Optional[str] = None
    page: int = 1
    page_size: int = 50




AGG_SUFFIXES = ["_count", "_sum", "_avg", "_min", "_max", "_tooltip"]
AGG_FUNCS = {"_count": "COUNT", "_sum": "SUM", "_avg": "AVG", "_min": "MIN", "_max": "MAX", "_tooltip": "MAX"}


def sanitize_identifier(name: str) -> str:
    if "." in name:
        name = name.rsplit(".", 1)[0]
    name = re.sub(r"[^\w]", "_", name).strip("_").lower()
    if name and name[0].isdigit():
        name = "t_" + name
    return name


def rewrite_dataset_names_in_sql(sql: str, datasets: List[Dataset]) -> str:
    if not sql:
        return sql
    # Sort datasets by length descending to avoid greedy short name replacement
    sorted_datasets = sorted(datasets, key=lambda d: len(d.name), reverse=True)
    
    rewritten = sql
    for d in sorted_datasets:
        sanitized = sanitize_identifier(d.name)
        escaped_orig = re.escape(d.name)
        escaped_san = re.escape(sanitized)
        
        # Replace quoted original name, e.g. "Customers Info" -> "ds_abc"
        rewritten = re.sub(rf'"{escaped_orig}"', f'"{d.table_name}"', rewritten, flags=re.IGNORECASE)
        # Replace quoted sanitized name, e.g. "customers_info" -> "ds_abc"
        rewritten = re.sub(rf'"{escaped_san}"', f'"{d.table_name}"', rewritten, flags=re.IGNORECASE)
        # Replace single quoted original name, e.g. 'Customers Info' -> "ds_abc"
        rewritten = re.sub(rf"'{escaped_orig}'", f'"{d.table_name}"', rewritten, flags=re.IGNORECASE)
        # Replace single quoted sanitized name, e.g. 'customers_info' -> "ds_abc"
        rewritten = re.sub(rf"'{escaped_san}'", f'"{d.table_name}"', rewritten, flags=re.IGNORECASE)
        
        # Replace word-boundary original name (if no spaces), e.g. \bCustomers\b
        if " " not in d.name:
            rewritten = re.sub(rf'(?<!")\b{escaped_orig}\b(?!")', f'"{d.table_name}"', rewritten, flags=re.IGNORECASE)
            
        # Replace sanitized name with word-boundaries, e.g. \bcustomers_info\b
        rewritten = re.sub(rf'(?<!")\b{escaped_san}\b(?!")', f'"{d.table_name}"', rewritten, flags=re.IGNORECASE)
        
    return rewritten


def sanitize_aliased_sql(sql: str) -> str:
    """
    Fix broken SQL where aggregate functions wrap aliased column names instead of base columns.
    E.g.: COUNT("question_count") AS "question_count_count" -> COUNT("question") AS "question_count"
          SUM("revenue_sum") AS "revenue_sum_sum"           -> SUM("revenue") AS "revenue_sum"
          COUNT("feedback_count_count") AS "feedback_count_count_count" -> COUNT("feedback") AS "feedback_count"
    This happens when saved widget SQL mistakenly uses query aliases as column references.
    Handles deeply nested corruption by iteratively stripping all aggregate suffixes.
    """
    if not sql:
        return sql

    def _strip_all_agg_suffixes(name: str) -> str:
        """Iteratively strip all aggregate suffixes to recover the base column name."""
        changed = True
        while changed:
            changed = False
            for suffix in AGG_SUFFIXES:
                if name.lower().endswith(suffix):
                    name = name[: -len(suffix)]
                    changed = True
                    break  # restart from the beginning of suffixes
        return name

    def fix_agg(match: re.Match) -> str:
        func = match.group(1).upper()
        col = match.group(2)
        alias_clause = match.group(3) or ""
        # Strip quotes from column reference
        inner = col.strip('"').strip("'")

        # Check if any aggregate suffix is present
        base = _strip_all_agg_suffixes(inner)
        if base != inner:
            # The column reference had aggregate suffixes — fix it
            # Determine the canonical suffix for this function
            func_suffix_map = {"COUNT": "_count", "SUM": "_sum", "AVG": "_avg", "MIN": "_min", "MAX": "_max"}
            canonical_suffix = func_suffix_map.get(func, "_count")
            canonical_alias = base + canonical_suffix

            fixed_alias = f' AS "{canonical_alias}"' if alias_clause or True else ""
            return f'{func}("{base}"){fixed_alias}'

        return match.group(0)  # no change — column has no aggregate suffix

    # Match: COUNT("col_count") optionally followed by AS "alias"
    pattern = r'\b(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*("[\w\s]+"|\'\w+\')\s*\)((?:\s+AS\s+"[\w\s]+")?)'
    return re.sub(pattern, fix_agg, sql, flags=re.IGNORECASE)


def normalize_dataset_table_quotes(sql: str, datasets: List[Dataset]) -> str:
    if not sql:
        return sql

    normalized = sql
    for dataset in datasets:
        table = re.escape(dataset.table_name)
        normalized = re.sub(rf'"+({table})"+', r'"\1"', normalized)
    return normalized


def explain_sql_error(sql: str, error_msg: str, dataset_columns: List[str]) -> Dict[str, Any]:
    error_lower = error_msg.lower()
    suggestion = None
    explanation = "An error occurred while executing the SQL query."
    
    if 'relation "dataset" does not exist' in error_lower or 'table "dataset" does not exist' in error_lower or 'relation dataset' in error_lower:
        explanation = "The table 'dataset' is a placeholder. You must reference the actual database table name (e.g. ds_xxx) or wrap it in double quotes."
        suggestion = sql
    elif 'column' in error_lower and ('not found' in error_lower or 'does not exist' in error_lower):
        col_match = re.search(r'column "([^"]+)" not found', error_lower)
        if not col_match:
            col_match = re.search(r'column ([^\s]+) does not exist', error_lower)
        
        if col_match:
            wrong_col = col_match.group(1).strip('"').strip("'")
            explanation = f"The column '{wrong_col}' was not found in the dataset schema."
            from difflib import get_close_matches
            matches = get_close_matches(wrong_col, dataset_columns, n=1, cutoff=0.4)
            if matches:
                correct_col = matches[0]
                explanation += f" Did you mean '{correct_col}'?"
                suggestion = re.sub(rf'\b{re.escape(wrong_col)}\b', f'"{correct_col}"', sql, flags=re.IGNORECASE)
        else:
            explanation = "One of the columns referenced in your SQL query does not exist in the selected dataset schema."
    elif 'syntax error' in error_lower or 'parser error' in error_lower:
        explanation = "There is a parser/syntax error in your SQL query. Please review spelling, commas, and parentheses."
        
    return {
        "error": error_msg,
        "explanation": explanation,
        "suggestion": suggestion
    }


@router.post("/chart")
async def get_chart_data(
    body: ChartRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    import time
    from app.models.extensions import QueryHistory
    db_url = body.db_url or (current_tenant.settings or {}).get("external_db_url")

    datasets_res = await db.execute(
        select(Dataset).where(Dataset.tenant_id == current_tenant.id)
    )
    datasets = list(datasets_res.scalars().all())

    sql = body.sql
    target_dataset_id = None
    if body.dataset_table:
        if not body.dataset_table.startswith("ds_"):
            raise HTTPException(status_code=400, detail="Invalid dataset table reference")
        for d in datasets:
            if d.table_name == body.dataset_table:
                target_dataset_id = d.id
                break
        if sql:
            sql = sql.replace("dataset", f'"{body.dataset_table}"')
        elif not body.nl_query:
            sql = f'SELECT * FROM "{body.dataset_table}"'

    if sql:
        sql = rewrite_dataset_names_in_sql(sql, datasets)

    sql = sanitize_aliased_sql(sql)
    sql = normalize_dataset_table_quotes(sql, datasets)

    start_time = time.time()
    try:
        result = await run_query(
            sql=sql,
            nl_query=body.nl_query if not sql else None,
            tenant_id=current_tenant.id,
            db_url=db_url,
            limit=body.limit,
        )
        duration_ms = int((time.time() - start_time) * 1000)
        
        # Log successful query execution in history
        hist = QueryHistory(
            sql_query=result["sql"] or sql,
            execution_time_ms=duration_ms,
            tenant_id=current_tenant.id,
            user_id=current_user.id,
            dataset_id=target_dataset_id,
        )
        db.add(hist)
        await db.commit()
    except Exception as e:
        dataset_columns = []
        for d in datasets:
            dataset_columns.extend(d.column_names)
        debug_info = explain_sql_error(sql or "", str(e), dataset_columns)
        raise HTTPException(
            status_code=400,
            detail={
                "error": str(e),
                "explanation": debug_info["explanation"],
                "suggestion": debug_info["suggestion"],
            }
        )

    chart_data = shape_for_chart(
        result["rows"], result["columns"],
        body.x_key, body.y_keys, body.chart_type
    )
    return {
        "chart_type": body.chart_type,
        "sql": result["sql"],
        "row_count": result["row_count"],
        **chart_data,
    }


@router.post("/explore")
async def explore_data(
    body: ExploreRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    import time
    from app.models.extensions import QueryHistory
    db_url = body.db_url or (current_tenant.settings or {}).get("external_db_url")

    datasets_res = await db.execute(
        select(Dataset).where(Dataset.tenant_id == current_tenant.id)
    )
    datasets = list(datasets_res.scalars().all())

    sql = body.sql
    target_dataset_id = None
    if body.dataset_table:
        if not body.dataset_table.startswith("ds_"):
            raise HTTPException(status_code=400, detail="Invalid dataset table reference")
        for d in datasets:
            if d.table_name == body.dataset_table:
                target_dataset_id = d.id
                break
        if not sql and not body.nl_query:
            sql = f'SELECT * FROM "{body.dataset_table}"'

    if sql:
        sql = rewrite_dataset_names_in_sql(sql, datasets)
        sql = sanitize_aliased_sql(sql)
        sql = normalize_dataset_table_quotes(sql, datasets)

    start_time = time.time()
    try:
        result = await run_query(
            sql=sql,
            nl_query=body.nl_query if not sql else None,
            tenant_id=current_tenant.id,
            db_url=db_url,
            limit=body.page_size * body.page,
        )
        duration_ms = int((time.time() - start_time) * 1000)
        
        hist = QueryHistory(
            sql_query=result["sql"] or sql,
            execution_time_ms=duration_ms,
            tenant_id=current_tenant.id,
            user_id=current_user.id,
            dataset_id=target_dataset_id,
        )
        db.add(hist)
        await db.commit()
    except Exception as e:
        dataset_columns = []
        for d in datasets:
            dataset_columns.extend(d.column_names)
        debug_info = explain_sql_error(sql or "", str(e), dataset_columns)
        raise HTTPException(
            status_code=400,
            detail={
                "error": str(e),
                "explanation": debug_info["explanation"],
                "suggestion": debug_info["suggestion"],
            }
        )

    rows = result["rows"]
    start = (body.page - 1) * body.page_size
    page_rows = rows[start:start + body.page_size]

    return {
        "columns": result["columns"],
        "rows": page_rows,
        "total": len(rows),
        "page": body.page,
        "page_size": body.page_size,
        "sql": result["sql"],
    }


@router.get("/history")
async def list_query_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    from app.models.extensions import QueryHistory
    result = await db.execute(
        select(QueryHistory)
        .where(QueryHistory.tenant_id == current_tenant.id)
        .order_by(QueryHistory.is_pinned.desc(), QueryHistory.created_at.desc())
        .limit(100)
    )
    history = result.scalars().all()
    return [
        {
            "id": h.id,
            "sql_query": h.sql_query,
            "is_favorite": h.is_favorite,
            "is_pinned": h.is_pinned,
            "execution_time_ms": h.execution_time_ms,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        }
        for h in history
    ]


@router.post("/history/{history_id}/favorite")
async def toggle_favorite_query(
    history_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    from app.models.extensions import QueryHistory
    result = await db.execute(
        select(QueryHistory).where(
            QueryHistory.id == history_id,
            QueryHistory.tenant_id == current_tenant.id
        )
    )
    hist = result.scalar_one_or_none()
    if not hist:
        raise HTTPException(status_code=404, detail="Query history item not found")
        
    hist.is_favorite = not hist.is_favorite
    await db.commit()
    return {"status": "success", "is_favorite": hist.is_favorite}


@router.post("/history/{history_id}/pin")
async def toggle_pin_query(
    history_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    from app.models.extensions import QueryHistory
    result = await db.execute(
        select(QueryHistory).where(
            QueryHistory.id == history_id,
            QueryHistory.tenant_id == current_tenant.id
        )
    )
    hist = result.scalar_one_or_none()
    if not hist:
        raise HTTPException(status_code=404, detail="Query history item not found")
        
    hist.is_pinned = not hist.is_pinned
    await db.commit()
    return {"status": "success", "is_pinned": hist.is_pinned}


@router.delete("/history/{history_id}")
async def delete_query_history(
    history_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    from app.models.extensions import QueryHistory
    result = await db.execute(
        select(QueryHistory).where(
            QueryHistory.id == history_id,
            QueryHistory.tenant_id == current_tenant.id
        )
    )
    hist = result.scalar_one_or_none()
    if not hist:
        raise HTTPException(status_code=404, detail="Query history item not found")
        
    await db.delete(hist)
    await db.commit()
    return {"status": "success"}


# Database Connectors Endpoints
class ConnectorCreate(BaseModel):
    name: str
    type: str  # postgresql|mysql|sqlserver|mongodb|duckdb
    credentials: Dict[str, Any]


@router.get("/connectors")
async def list_connectors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    from app.models.extensions import DatabaseConnector
    result = await db.execute(
        select(DatabaseConnector).where(DatabaseConnector.tenant_id == current_tenant.id)
    )
    connectors = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "type": c.type,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in connectors
    ]


@router.post("/connectors")
async def create_connector(
    body: ConnectorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    from app.models.extensions import DatabaseConnector
    connector = DatabaseConnector(
        name=body.name,
        type=body.type,
        credentials=body.credentials,
        tenant_id=current_tenant.id,
    )
    db.add(connector)
    await db.commit()
    return {"status": "success", "connector_id": connector.id}


@router.post("/connectors/test")
async def test_connector(
    body: ConnectorCreate,
    current_user: User = Depends(get_current_user),
):
    import sqlalchemy
    db_type = body.type.lower()
    creds = body.credentials
    
    if db_type == "duckdb":
        import duckdb
        try:
            conn = duckdb.connect(creds.get("database", ":memory:"))
            conn.close()
            return {"status": "success", "message": "Successfully connected to DuckDB!"}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"DuckDB connection failed: {e}")
            
    # For PostgreSQL / MySQL / SQLServer
    try:
        if db_type == "postgresql":
            url = f"postgresql://{creds.get('user')}:{creds.get('password')}@{creds.get('host')}:{creds.get('port', 5432)}/{creds.get('database')}"
        elif db_type == "mysql":
            url = f"mysql+pymysql://{creds.get('user')}:{creds.get('password')}@{creds.get('host')}:{creds.get('port', 3306)}/{creds.get('database')}"
        elif db_type == "sqlserver":
            url = f"mssql+pyodbc://{creds.get('user')}:{creds.get('password')}@{creds.get('host')}:{creds.get('port', 1433)}/{creds.get('database')}"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported database connection type: {body.type}")
            
        engine = sqlalchemy.create_engine(url)
        with engine.connect() as connection:
            pass
        return {"status": "success", "message": f"Successfully connected to {body.type}!"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Database connection test failed: {e}")


@router.delete("/connectors/{connector_id}")
async def delete_connector(
    connector_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    from app.models.extensions import DatabaseConnector
    result = await db.execute(
        select(DatabaseConnector).where(
            DatabaseConnector.id == connector_id,
            DatabaseConnector.tenant_id == current_tenant.id
        )
    )
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(status_code=404, detail="Database connector not found")
        
    await db.delete(connector)
    await db.commit()
    return {"status": "success"}


@router.get("/navigator")
async def get_db_navigator(
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    # Fetch all datasets for the tenant
    datasets_res = await db.execute(
        select(Dataset).where(Dataset.tenant_id == current_tenant.id, Dataset.status == "ready")
    )
    datasets = list(datasets_res.scalars().all())

    # Get relationships from all dashboards for this tenant
    from app.models.dashboard import Dashboard
    dashboards_res = await db.execute(
        select(Dashboard).where(Dashboard.tenant_id == current_tenant.id)
    )
    dashboards = list(dashboards_res.scalars().all())
    
    all_relationships = []
    for d in dashboards:
        if d.layout_config and "relationships" in d.layout_config:
            all_relationships.extend(d.layout_config["relationships"])

    # Build response hierarchy
    tables = []
    for d in datasets:
        sanitized_name = sanitize_identifier(d.name)
        
        # Build columns list
        columns = []
        for col in d.column_names:
            col_type = d.column_types.get(col, "TEXT")
            columns.append({
                "name": col,
                "type": col_type
            })

        # Filter relationships where this table participates
        relationships = []
        for r in all_relationships:
            if r.get("from_table") == d.table_name or r.get("to_table") == d.table_name:
                relationships.append(r)

        tables.append({
            "id": d.id,
            "name": d.name,
            "sanitized_name": sanitized_name,
            "table_name": d.table_name,
            "row_count": d.row_count,
            "columns": columns,
            "relationships": relationships
        })

    return {
        "schema": "public",
        "tables": tables
    }


class AIGenerateRequest(BaseModel):
    prompt: str
    db_url: Optional[str] = None


@router.post("/ai/generate")
async def ai_generate_sql(
    body: AIGenerateRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    db_url = body.db_url or (current_tenant.settings or {}).get("external_db_url")
    from app.tools.sql_executor import sql_executor
    schema = await sql_executor.get_schema(current_tenant.id, db_url=db_url)
    
    datasets_res = await db.execute(
        select(Dataset).where(Dataset.tenant_id == current_tenant.id, Dataset.status == "ready")
    )
    datasets = list(datasets_res.scalars().all())
    
    schema_map_desc = []
    for d in datasets:
        cols_desc = ", ".join([f"{col} ({d.column_types.get(col, 'TEXT')})" for col in d.column_names])
        schema_map_desc.append(
            f"Table: {d.table_name} (User-facing name: '{d.name}' or '{sanitize_identifier(d.name)}')\n"
            f"Columns: {cols_desc}"
        )
    schema_desc = "\n\n".join(schema_map_desc) if schema_map_desc else str(schema)

    system_prompt = (
        "You are an expert SQL Generator. Your task is to output a single, read-only PostgreSQL SELECT query based on the user's question and the database schema.\n"
        "Rules:\n"
        "1. Return only valid PostgreSQL SELECT queries.\n"
        "2. Do not explain the query. Return ONLY raw SQL inside a markdown ```sql code block.\n"
        "3. Always reference the actual database table names (like ds_xxx) instead of user-facing names.\n"
        "4. Double quote table and column names if they contain special characters or spaces.\n"
    )

    sql = None
    has_valid_key = settings.OPENROUTER_API_KEY and settings.OPENROUTER_API_KEY not in ["replace-with-your-openrouter-key", "YOUR_KEY"]
    if has_valid_key:
        try:
            response = await llm_service.complete(
                model=settings.MODEL_SQL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Schema:\n{schema_desc}\n\nQuestion:\n{body.prompt}"}
                ],
                temperature=0.1
            )
            content = response["content"]
            from app.services.nl_to_sql import _extract_sql
            sql = _extract_sql(content) or content.strip()
        except Exception as e:
            logger.warning("ai_sql_generate_failed", error=str(e))

    if not sql:
        # Fallback to local rule-based generator
        from app.services.nl_to_sql import _local_sql_fallback
        sql = _local_sql_fallback(body.prompt, schema)
        if not sql:
            sql = _local_sql_fallback(body.prompt, schema_desc)

    if not sql:
        if datasets:
            sql = f'SELECT * FROM "{datasets[0].table_name}" LIMIT 100;'
        else:
            raise HTTPException(status_code=400, detail="LLM SQL generation failed and no virtual datasets found to generate query locally.")

    return {"sql": sql}


class AIExplainRequest(BaseModel):
    sql: str
    db_url: Optional[str] = None


@router.post("/ai/explain")
async def ai_explain_sql(
    body: AIExplainRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    datasets_res = await db.execute(
        select(Dataset).where(Dataset.tenant_id == current_tenant.id, Dataset.status == "ready")
    )
    datasets = list(datasets_res.scalars().all())
    mapping_desc = "\n".join([f"- Table '{d.table_name}' corresponds to the uploaded dataset '{d.name}'" for d in datasets])

    system_prompt = (
        "You are a Senior Database Analyst. Your job is to explain the provided SQL query in clear, conversational English.\n"
        "Explain:\n"
        "1. What business question this query is trying to answer.\n"
        "2. The technical operations performed (joins, filters, groupings, aggregation columns).\n"
        "3. Keep it brief, professional, and easy to understand. Return markdown format."
    )

    user_content = f"SQL Query:\n{body.sql}\n\nDataset Mapping Context:\n{mapping_desc}"
    explanation = None
    has_valid_key = settings.OPENROUTER_API_KEY and settings.OPENROUTER_API_KEY not in ["replace-with-your-openrouter-key", "YOUR_KEY"]
    if has_valid_key:
        try:
            response = await llm_service.complete(
                model=settings.MODEL_ANALYSIS,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.3
            )
            explanation = response["content"]
        except Exception as e:
            logger.warning("ai_sql_explain_failed", error=str(e))

    if not explanation:
        # Generate local query explanation summary
        sql_upper = body.sql.upper()
        referenced = []
        for d in datasets:
            if d.table_name in body.sql or sanitize_identifier(d.name) in body.sql or d.name in body.sql:
                referenced.append(d)
        ref_text = ", ".join([f"'{r.name}'" for r in referenced]) if referenced else "the dataset"
        
        explanation = (
            f"### Local Query Explanation\n"
            f"*(Note: AI explanation service is currently offline. Showing local programmatic summary)*\n\n"
            f"This query retrieves records from {ref_text}.\n\n"
            f"**Query Operations**:\n"
        )
        if "LIMIT" in sql_upper:
            limit_match = re.search(r'LIMIT\s+(\d+)', body.sql, re.IGNORECASE)
            limit_str = f"up to {limit_match.group(1)} rows" if limit_match else "a subset of rows"
            explanation += f"- Restricts results to {limit_str}.\n"
        if "WHERE" in sql_upper:
            explanation += f"- Filters matching records using custom criteria.\n"
        if "GROUP BY" in sql_upper:
            explanation += f"- Groups records for summary metrics.\n"
        if "ORDER BY" in sql_upper:
            explanation += f"- Orders query results dynamically.\n"
            
    return {"explanation": explanation}


class AIDebugRequest(BaseModel):
    sql: str
    error: str
    db_url: Optional[str] = None


@router.post("/ai/debug")
async def ai_debug_sql(
    body: AIDebugRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    db_url = body.db_url or (current_tenant.settings or {}).get("external_db_url")
    from app.tools.sql_executor import sql_executor
    schema = await sql_executor.get_schema(current_tenant.id, db_url=db_url)
    
    datasets_res = await db.execute(
        select(Dataset).where(Dataset.tenant_id == current_tenant.id, Dataset.status == "ready")
    )
    datasets = list(datasets_res.scalars().all())
    schema_map_desc = []
    for d in datasets:
        cols_desc = ", ".join([f"{col} ({d.column_types.get(col, 'TEXT')})" for col in d.column_names])
        schema_map_desc.append(
            f"Table: {d.table_name} (User-facing name: '{d.name}' or '{sanitize_identifier(d.name)}')\n"
            f"Columns: {cols_desc}"
        )
    schema_desc = "\n\n".join(schema_map_desc) if schema_map_desc else str(schema)

    system_prompt = (
        "You are an expert PostgreSQL developer. Fix the PostgreSQL SELECT query based on the database schema and the error message.\n"
        "Return ONLY the corrected SQL query inside a markdown ```sql code block. Do not explain the fix."
    )

    user_content = (
        f"Schema:\n{schema_desc}\n\n"
        f"Broken SQL:\n{body.sql}\n\n"
        f"Error Message:\n{body.error}"
    )

    fixed_sql = None
    has_valid_key = settings.OPENROUTER_API_KEY and settings.OPENROUTER_API_KEY not in ["replace-with-your-openrouter-key", "YOUR_KEY"]
    if has_valid_key:
        try:
            response = await llm_service.complete(
                model=settings.MODEL_SQL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.1
            )
            content = response["content"]
            from app.services.nl_to_sql import _extract_sql
            fixed_sql = _extract_sql(content) or content.strip()
        except Exception as e:
            logger.warning("ai_sql_debug_failed", error=str(e))

    if not fixed_sql:
        s = body.sql
        err = body.error.lower()
        
        # 1. Missing table "dataset"
        if 'relation "dataset" does not exist' in err or 'table "dataset" does not exist' in err:
            if datasets:
                first_tbl = datasets[0].table_name
                s = re.sub(r'\bdataset\b', f'"{first_tbl}"', s, flags=re.IGNORECASE)
                fixed_sql = s
                
        # 2. Schema tree mismatch (user-friendly name mapping)
        if not fixed_sql:
            fixed_sql = rewrite_dataset_names_in_sql(s, datasets)
            
    if not fixed_sql:
        fixed_sql = body.sql  # fallback to original
        
    return {"sql": fixed_sql}
