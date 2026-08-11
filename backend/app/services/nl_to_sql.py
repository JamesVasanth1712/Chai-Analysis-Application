import re
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.services.llm_service import llm_service
from app.tools.sql_executor import sql_executor


async def run_query(
    sql: Optional[str] = None,
    nl_query: Optional[str] = None,
    tenant_id: Optional[str] = None,
    db_url: Optional[str] = None,
    limit: int = 1000,
    schema_hint: Optional[str] = None,
) -> Dict[str, Any]:
    if not sql and not nl_query:
        raise ValueError("Either sql or nl_query must be provided")

    final_sql = sql
    if not final_sql and nl_query:
        schema = None
        if db_url:
            schema = await sql_executor.get_schema(tenant_id or "", db_url=db_url)
        elif tenant_id:
            schema = await sql_executor.get_schema(tenant_id)

        if settings.OPENROUTER_API_KEY and settings.OPENROUTER_API_KEY not in ["replace-with-your-openrouter-key", "YOUR_KEY"]:
            try:
                response = await llm_service.complete(
                    model=settings.MODEL_SQL,
                    messages=[
                        {
                            "role": "system",
                            "content": "Generate one read-only PostgreSQL SELECT query. Return only SQL.",
                        },
                        {
                            "role": "user",
                            "content": f"Schema:\n{schema or schema_hint}\n\nQuestion:\n{nl_query}",
                        },
                    ],
                    temperature=0,
                    max_tokens=600,
                )
                final_sql = _extract_sql(response["content"]) or response["content"].strip()
            except Exception as e:
                logger.warning("llm_sql_generation_failed", error=str(e))
                final_sql = None

        if not final_sql:
            final_sql = _local_sql_fallback(nl_query, schema or schema_hint)

    if not final_sql:
        raise ValueError("Could not generate SQL from the provided query")

    rows = await sql_executor.execute(final_sql, tenant_id=tenant_id, db_url=db_url, limit=limit)
    columns = list(rows[0].keys()) if rows else []
    return {"rows": rows, "columns": columns, "sql": final_sql, "row_count": len(rows)}


def _local_sql_fallback(nl_query: str, schema: Any) -> Optional[str]:
    """Programmatic rule-based SQL query generator when the LLM is unavailable."""
    query_lower = nl_query.lower()
    tables = []
    table_columns = {}

    if isinstance(schema, dict):
        for t, cols in schema.items():
            if t.startswith("ds_"):
                tables.append(t)
                table_columns[t] = [c["column"] for c in cols]
    elif isinstance(schema, str):
        found_tables = re.findall(r"\bds_[0-9a-fA-F]+\b", schema)
        for t in found_tables:
            if t not in tables:
                tables.append(t)

    if not tables:
        return None

    # Determine target table
    target_table = None
    for t in tables:
        if t in query_lower:
            target_table = t
            break

    if not target_table:
        best_match_count = -1
        for t, cols in table_columns.items():
            match_count = 0
            for col in cols:
                if col in query_lower or col.replace("_", " ") in query_lower:
                    match_count += 1
            if match_count > best_match_count:
                best_match_count = match_count
                target_table = t

    if not target_table:
        target_table = tables[0]

    cols = table_columns.get(target_table, [])

    # Count / rows queries
    if "how many" in query_lower or "count" in query_lower or "total number of" in query_lower:
        return f'SELECT COUNT(*) FROM "{target_table}"'

    # Average / group by queries
    if "average" in query_lower or "avg" in query_lower:
        avg_col = None
        for col in cols:
            if col in ("rating", "price", "helpful_votes", "score", "value", "amount", "revenue"):
                if col in query_lower or col.replace("_", " ") in query_lower:
                    avg_col = col
                    break
        if not avg_col:
            for col in cols:
                if col in ("rating", "price", "helpful_votes", "score", "value", "amount", "revenue"):
                    avg_col = col
                    break
        if avg_col:
            group_by_col = None
            for col in cols:
                if col in ("product_name", "product", "user_location", "location", "category", "feedback"):
                    if col in query_lower or col.replace("_", " ") in query_lower:
                        group_by_col = col
                        break
            if group_by_col:
                return f'SELECT "{group_by_col}", AVG("{avg_col}") AS "avg_{avg_col}" FROM "{target_table}" GROUP BY "{group_by_col}"'
            return f'SELECT AVG("{avg_col}") AS "average_{avg_col}" FROM "{target_table}"'

    # Top / highest queries
    if "top" in query_lower or "highest" in query_lower or "best" in query_lower:
        limit_match = re.search(r"\btop\s+(\d+)\b", query_lower)
        limit = limit_match.group(1) if limit_match else "10"
        
        sort_col = None
        for col in cols:
            if col in ("rating", "price", "helpful_votes", "score", "value", "amount", "revenue"):
                sort_col = col
                break
        if not sort_col and cols:
            sort_col = cols[0]
            
        select_cols = []
        for col in cols:
            if col in ("product_name", "product", "user_name", "user", "title", "name", "question", "comments", "feedback"):
                select_cols.append(f'"{col}"')
        if sort_col and f'"{sort_col}"' not in select_cols:
            select_cols.append(f'"{sort_col}"')
            
        if not select_cols:
            select_cols = ["*"]
            
        if sort_col:
            return f'SELECT {", ".join(select_cols)} FROM "{target_table}" ORDER BY "{sort_col}" DESC LIMIT {limit}'
        return f'SELECT {", ".join(select_cols)} FROM "{target_table}" LIMIT {limit}'

    # Worst / lowest queries
    if "worst" in query_lower or "lowest" in query_lower or "bad" in query_lower:
        limit_match = re.search(r"\blimit\s+(\d+)\b|\bfirst\s+(\d+)\b", query_lower)
        limit = limit_match.group(1) or limit_match.group(2) if limit_match else "10"
        
        sort_col = None
        for col in cols:
            if col in ("rating", "price", "helpful_votes", "score"):
                sort_col = col
                break
        if sort_col:
            return f'SELECT * FROM "{target_table}" ORDER BY "{sort_col}" ASC LIMIT {limit}'

    # Default to simple select
    limit_match = re.search(r"\blimit\s+(\d+)\b|\btop\s+(\d+)\b", query_lower)
    limit = limit_match.group(1) or limit_match.group(2) if limit_match else "10"
    return f'SELECT * FROM "{target_table}" LIMIT {limit}'


def _extract_sql(text: str) -> Optional[str]:
    fenced = re.search(r"```sql\s*([\s\S]+?)\s*```", text, re.IGNORECASE)
    if fenced:
        return fenced.group(1).strip()
    select = re.search(r"\b(SELECT|WITH)\b[\s\S]+", text, re.IGNORECASE)
    if select:
        return select.group(0).split(";")[0].strip()
    return None


def shape_for_chart(
    rows: List[Dict],
    columns: List[str],
    x_key: Optional[str],
    y_keys: Optional[List[str]],
    chart_type: str,
) -> Dict[str, Any]:
    if not rows:
        return {"labels": [], "series": [], "columns": columns}

    if chart_type == "table":
        return {
            "labels": [],
            "series": rows,
            "x_key": x_key or (columns[0] if columns else None),
            "y_keys": y_keys or [],
            "columns": columns,
        }

    # Validate x_key exists in columns; fall back to first column
    if not x_key or x_key not in columns:
        x_key = columns[0] if columns else None

    # Validate y_keys exist in actual result columns
    # If stored y_keys are stale (e.g. after SQL sanitization renamed aliases), auto-detect
    valid_y_keys = [k for k in (y_keys or []) if k in columns]
    if not valid_y_keys:
        numeric_cols = [c for c in columns if c != x_key and _is_numeric(rows, c)]
        valid_y_keys = numeric_cols[:4] if numeric_cols else ([columns[1]] if len(columns) > 1 else [])
    y_keys = valid_y_keys

    labels = [str(row.get(x_key, "")) for row in rows]

    if chart_type in ("pie", "donut"):
        value_key = y_keys[0] if y_keys else (columns[1] if len(columns) > 1 else columns[0])
        series = [{"name": str(row.get(x_key, "")), "value": _to_float(row.get(value_key, 0))} for row in rows]
        return {"labels": labels, "series": series, "x_key": x_key, "y_keys": [value_key], "columns": columns}

    if chart_type == "card":
        value_key = y_keys[0] if y_keys else (columns[1] if len(columns) > 1 else columns[0])
        return {
            "labels": [str(x_key or value_key)],
            "series": [{"name": value_key, "value": _to_float(rows[0].get(value_key, 0))}],
            "x_key": x_key,
            "y_keys": [value_key],
            "columns": columns,
        }

    series = []
    for y_key in (y_keys or []):
        series.append({
            "name": y_key,
            "data": [_to_float(row.get(y_key, 0)) for row in rows],
        })

    return {"labels": labels, "series": series, "x_key": x_key, "y_keys": y_keys, "columns": columns}


def _is_numeric(rows: List[Dict], col: str) -> bool:
    try:
        vals = [rows[i].get(col) for i in range(min(5, len(rows))) if rows[i].get(col) is not None]
        return all(isinstance(v, (int, float)) or str(v).replace(".", "").replace("-", "").isdigit() for v in vals)
    except Exception:
        return False


def _to_float(value: Any) -> float:
    try:
        return float(value) if value is not None else 0.0
    except (ValueError, TypeError):
        return 0.0
