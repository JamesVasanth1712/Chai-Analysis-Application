import re
import uuid
from typing import Any, Dict, List, Tuple
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
import structlog

logger = structlog.get_logger()

# Map pandas/python types to PostgreSQL column types
TYPE_MAP = {
    "int64": "BIGINT", "int32": "INTEGER", "int16": "SMALLINT", "int8": "SMALLINT",
    "float64": "DOUBLE PRECISION", "float32": "REAL",
    "bool": "BOOLEAN", "object": "TEXT", "string": "TEXT",
    "datetime64[ns]": "TIMESTAMP", "datetime64": "TIMESTAMP",
}


def _safe_col(name: str) -> str:
    """Sanitize column name for use in SQL DDL."""
    name = re.sub(r"[^\w]", "_", str(name)).strip("_") or "col"
    if name[0].isdigit():
        name = "c_" + name
    return name.lower()[:63]


def _safe_cols(column_names: List[str]) -> List[str]:
    seen: Dict[str, int] = {}
    safe_cols = []
    for index, column_name in enumerate(column_names):
        base = _safe_col(column_name or f"col_{index + 1}")[:58]
        count = seen.get(base, 0)
        seen[base] = count + 1
        safe_cols.append(base if count == 0 else f"{base}_{count + 1}")
    return safe_cols


def _infer_pg_type(sample_values: list) -> str:
    non_null = [v for v in sample_values if v is not None and str(v).strip() != ""]
    if not non_null:
        return "TEXT"
    try:
        [int(v) for v in non_null]
        return "BIGINT"
    except (ValueError, TypeError):
        pass
    try:
        [float(v) for v in non_null]
        return "DOUBLE PRECISION"
    except (ValueError, TypeError):
        pass
    return "TEXT"


async def create_dataset_table(
    rows: List[Dict[str, Any]],
    column_names: List[str],
) -> Tuple[str, Dict[str, str], str]:
    """
    Create a dynamic table ds_<uuid> in PostgreSQL for the dataset rows.
    Returns (table_name, column_types_dict, safe_table_name).
    """
    table_id = str(uuid.uuid4()).replace("-", "")[:20]
    table_name = f"ds_{table_id}"

    if not column_names:
        raise ValueError("Dataset must contain at least one column")

    safe_cols = _safe_cols(column_names)
    col_types: Dict[str, str] = {}
    col_defs = []

    for i, col in enumerate(safe_cols):
        samples = [row.get(column_names[i]) for row in rows[:50]]
        pg_type = _infer_pg_type(samples)
        col_types[column_names[i]] = pg_type
        col_defs.append(f'"{col}" {pg_type}')

    ddl = f'CREATE TABLE IF NOT EXISTS "{table_name}" (id SERIAL PRIMARY KEY, {", ".join(col_defs)})'

    async with AsyncSessionLocal() as db:
        await db.execute(text(ddl))

        if rows:
            safe_col_list = ", ".join(f'"{c}"' for c in safe_cols)
            placeholders = ", ".join(f":{safe_cols[i]}" for i in range(len(column_names)))
            insert_sql = f'INSERT INTO "{table_name}" ({safe_col_list}) VALUES ({placeholders})'

            batch_size = 500
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                params = []
                for row in batch:
                    p = {}
                    for j, orig_col in enumerate(column_names):
                        safe = safe_cols[j]
                        val = row.get(orig_col)
                        if val == "" or val is None:
                            p[safe] = None
                        else:
                            pg_type = col_types.get(orig_col, "TEXT")
                            if pg_type in ("BIGINT", "INTEGER", "SMALLINT"):
                                try:
                                    p[safe] = int(float(str(val)))
                                except (ValueError, TypeError):
                                    p[safe] = None
                            elif pg_type in ("DOUBLE PRECISION", "REAL"):
                                try:
                                    p[safe] = float(str(val))
                                except (ValueError, TypeError):
                                    p[safe] = None
                            else:
                                p[safe] = str(val)
                    params.append(p)
                await db.execute(text(insert_sql), params)

        await db.commit()

    logger.info("dataset_table_created", table=table_name, rows=len(rows), cols=len(safe_cols))
    return table_name, col_types, safe_cols


async def drop_dataset_table(table_name: str):
    """Drop a dataset table when a dataset is deleted."""
    if not table_name.startswith("ds_"):
        raise ValueError("Will only drop ds_* tables")
    async with AsyncSessionLocal() as db:
        await db.execute(text(f'DROP TABLE IF EXISTS "{table_name}"'))
        await db.commit()
    logger.info("dataset_table_dropped", table=table_name)
