import re
from typing import Any, Dict, List, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from app.core.database import AsyncSessionLocal
import structlog

logger = structlog.get_logger()

# Read-only SQL — these are the only allowed statement types for agent execution
ALLOWED_STATEMENTS = {"SELECT", "WITH", "EXPLAIN", "SHOW", "DESCRIBE", "DESC"}
BLOCKED_PATTERNS = [
    r"\bDROP\b", r"\bDELETE\b", r"\bTRUNCATE\b", r"\bUPDATE\b",
    r"\bINSERT\b", r"\bALTER\b", r"\bCREATE\b", r"\bGRANT\b",
    r"\bREVOKE\b", r"\bEXECUTE\b",
]

# Simple in-process cache of engines per db_url to avoid recreating on every query
_engine_cache: Dict[str, Any] = {}


def _make_async_url(db_url: str) -> str:
    """Normalize any DB URL to its async driver equivalent."""
    if db_url.startswith("postgresql://") or db_url.startswith("postgres://"):
        return db_url.replace("postgresql://", "postgresql+asyncpg://", 1).replace("postgres://", "postgresql+asyncpg://", 1)
    if db_url.startswith("mysql://") or db_url.startswith("mysql+mysqlconnector://"):
        return db_url.replace("mysql://", "mysql+aiomysql://", 1).replace("mysql+mysqlconnector://", "mysql+aiomysql://", 1)
    if db_url.startswith("mysql+aiomysql://"):
        return db_url
    return db_url


def split_sql_statements(sql: str) -> List[str]:
    # Split sql statements by semicolon, ignoring semicolons within quotes
    statements = []
    current = []
    in_single_quote = False
    in_double_quote = False
    in_comment_inline = False
    in_comment_block = False
    
    chars = list(sql)
    i = 0
    while i < len(chars):
        c = chars[i]
        
        # Check inline comment --
        if not in_single_quote and not in_double_quote and not in_comment_block:
            if c == '-' and i + 1 < len(chars) and chars[i + 1] == '-':
                in_comment_inline = True
                current.append(c)
                i += 1
                current.append(chars[i])
                i += 1
                continue
            
        # Check block comment /*
        if not in_single_quote and not in_double_quote and not in_comment_inline:
            if c == '/' and i + 1 < len(chars) and chars[i + 1] == '*':
                in_comment_block = True
                current.append(c)
                i += 1
                current.append(chars[i])
                i += 1
                continue
                
        # Check inline comment end (newline)
        if in_comment_inline and c == '\n':
            in_comment_inline = False
            current.append(c)
            i += 1
            continue
            
        # Check block comment end */
        if in_comment_block:
            if c == '*' and i + 1 < len(chars) and chars[i + 1] == '/':
                in_comment_block = False
                current.append(c)
                i += 1
                current.append(chars[i])
                i += 1
                continue
                
        if in_comment_inline or in_comment_block:
            current.append(c)
            i += 1
            continue
            
        # Quotes
        if c == "'" and (i == 0 or chars[i - 1] != '\\'):
            in_single_quote = not in_single_quote
        elif c == '"' and (i == 0 or chars[i - 1] != '\\'):
            in_double_quote = not in_double_quote
            
        if c == ';' and not in_single_quote and not in_double_quote:
            statements.append("".join(current).strip())
            current = []
        else:
            current.append(c)
        i += 1
        
    if current:
        statements.append("".join(current).strip())
        
    return [s for s in statements if s]


class SQLExecutor:
    def _validate_sql(self, sql: str) -> None:
        # Strip comments to inspect the actual starting statement
        cleaned_sql = re.sub(r'/\*[\s\S]*?\*/|--.*', '', sql).strip()
        sql_upper = cleaned_sql.upper()
        
        # Extract the first alphabetic word token
        match = re.match(r'^\s*([A-Z]+)', sql_upper)
        first_word = match.group(1) if match else ""
        
        if first_word not in ALLOWED_STATEMENTS:
            raise ValueError(f"Only SELECT queries are allowed. Got: {first_word or 'empty query'}")
            
        full_upper = sql.upper()
        for pattern in BLOCKED_PATTERNS:
            if re.search(pattern, full_upper):
                raise ValueError(f"Dangerous SQL pattern detected: {pattern}")

    def _rewrite_statement(self, stmt: str) -> str:
        s = stmt.strip()
        
        # Cleanup double quotes in schema literals, e.g. TABLE_NAME = '"ds_xxx"' -> TABLE_NAME = 'ds_xxx'
        s = re.sub(r"=\s*'\"([\w_]+)\"'", r"= '\1'", s, flags=re.IGNORECASE)
        s = re.sub(r"like\s*'\"([\w_]+)\"'", r"LIKE '\1'", s, flags=re.IGNORECASE)
        
        # SHOW COLUMNS FROM or SHOW COLUMNS IN
        col_match = re.match(r'^\s*SHOW\s+COLUMNS\s+(?:FROM|IN)\s+((?:"?[\w_]+"?\.)?"?[\w_]+"?)', s, re.IGNORECASE)
        if col_match:
            table_name = col_match.group(1).replace('"', '').strip()
            if '.' in table_name:
                table_name = table_name.split('.')[-1]
            return f"""
            SELECT 
                column_name AS "column",
                data_type AS "type",
                is_nullable AS "nullable"
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = '{table_name}'
            ORDER BY ordinal_position;
            """
            
        # DESCRIBE or DESC
        desc_match = re.match(r'^\s*(?:DESCRIBE|DESC)\s+((?:"?[\w_]+"?\.)?"?[\w_]+"?)', s, re.IGNORECASE)
        if desc_match:
            table_name = desc_match.group(1).replace('"', '').strip()
            if '.' in table_name:
                table_name = table_name.split('.')[-1]
            return f"""
            SELECT 
                column_name AS "column",
                data_type AS "type",
                is_nullable AS "nullable"
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = '{table_name}'
            ORDER BY ordinal_position;
            """
            
        # SHOW TABLES
        tables_match = re.match(r'^\s*SHOW\s+TABLES\b', s, re.IGNORECASE)
        if tables_match:
            return """
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
            """
            
        # SHOW SCHEMAS or SHOW DATABASES
        schemas_match = re.match(r'^\s*SHOW\s+(?:SCHEMAS|DATABASES)\b', s, re.IGNORECASE)
        if schemas_match:
            return """
            SELECT schema_name 
            FROM information_schema.schemata
            ORDER BY schema_name;
            """
            
        return s

    def _preprocess_and_validate_sql(self, sql: str) -> List[str]:
        statements = split_sql_statements(sql)
        if not statements:
            raise ValueError("No SQL statements found to execute")
            
        processed_statements = []
        for stmt in statements:
            # 1. Validate
            self._validate_sql(stmt)
            # 2. Rewrite
            rewritten = self._rewrite_statement(stmt)
            processed_statements.append(rewritten)
            
        return processed_statements

    async def execute(
        self,
        sql: str,
        params: Optional[Dict[str, Any]] = None,
        tenant_id: Optional[str] = None,
        limit: int = 1000,
        db_url: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        statements = self._preprocess_and_validate_sql(sql)
        
        last_rows = []
        
        if db_url:
            for stmt in statements:
                safe_stmt = stmt.rstrip().rstrip(";")
                if "LIMIT" not in safe_stmt.upper():
                    safe_stmt = f"{safe_stmt} LIMIT {limit}"
                last_rows = await self._execute_external(safe_stmt, params, db_url)
            return last_rows

        async with AsyncSessionLocal() as session:
            try:
                for stmt in statements:
                    safe_stmt = stmt.rstrip().rstrip(";")
                    if "LIMIT" not in safe_stmt.upper():
                        safe_stmt = f"{safe_stmt} LIMIT {limit}"
                    result = await session.execute(text(safe_stmt), params or {})
                    columns = list(result.keys())
                    rows = result.fetchall()
                    last_rows = [dict(zip(columns, row)) for row in rows]
                return last_rows
            except Exception as e:
                logger.error("sql_execution_error", sql=sql[:200], error=str(e))
                raise

    async def _execute_external(
        self,
        sql: str,
        params: Optional[Dict[str, Any]],
        db_url: str,
    ) -> List[Dict[str, Any]]:
        async_url = _make_async_url(db_url)
        if async_url not in _engine_cache:
            _engine_cache[async_url] = create_async_engine(async_url, pool_size=2, max_overflow=0)
        engine = _engine_cache[async_url]
        async with engine.connect() as conn:
            try:
                result = await conn.execute(text(sql), params or {})
                columns = list(result.keys())
                rows = result.fetchall()
                return [dict(zip(columns, row)) for row in rows]
            except Exception as e:
                logger.error("external_sql_execution_error", sql=sql[:200], error=str(e))
                raise

    async def get_schema(self, tenant_id: str, db_url: Optional[str] = None) -> Dict[str, Any]:
        """Retrieve database schema for AI context — app DB or external DB."""
        schema_sql = """
        SELECT
            t.table_name,
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default
        FROM information_schema.tables t
        JOIN information_schema.columns c ON t.table_name = c.table_name
        WHERE t.table_schema = 'public'
        ORDER BY t.table_name, c.ordinal_position
        """
        try:
            rows = await self.execute(schema_sql, db_url=db_url)
            schema: Dict[str, List] = {}
            for row in rows:
                table = row["table_name"]
                if table not in schema:
                    schema[table] = []
                schema[table].append({
                    "column": row["column_name"],
                    "type": row["data_type"],
                    "nullable": row["is_nullable"] == "YES",
                })
            return schema
        except Exception as e:
            logger.error("schema_fetch_failed", error=str(e))
            return {}

    async def test_connection(self, db_url: str) -> Dict[str, Any]:
        """Test an external database connection and return basic info."""
        try:
            rows = await self._execute_external(
                "SELECT current_database() AS db, version() AS version",
                None,
                db_url,
            )
            return {"ok": True, "info": rows[0] if rows else {}}
        except Exception as e:
            return {"ok": False, "error": str(e)}


sql_executor = SQLExecutor()
