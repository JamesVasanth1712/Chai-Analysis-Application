from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.api.deps import get_current_user, get_current_tenant
from app.core.database import get_db
from app.models.user import User
from app.models.tenant import Tenant
from app.tools.sql_executor import sql_executor
import structlog

logger = structlog.get_logger()
router = APIRouter(prefix="/settings", tags=["settings"])


class DatabaseConnectionRequest(BaseModel):
    db_url: str


@router.get("/database")
async def get_database_settings(
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    db_url = (current_tenant.settings or {}).get("external_db_url", "")
    return {"db_url": db_url, "configured": bool(db_url)}


@router.post("/database")
async def save_database_settings(
    body: DatabaseConnectionRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == current_tenant.id))
    tenant = result.scalar_one()
    settings = dict(tenant.settings or {})
    settings["external_db_url"] = body.db_url
    tenant.settings = settings
    await db.commit()
    logger.info("external_db_configured", tenant=current_tenant.id)
    return {"ok": True, "message": "Database connection saved"}


@router.post("/database/test")
async def test_database_connection(
    body: DatabaseConnectionRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    result = await sql_executor.test_connection(body.db_url)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Connection failed"))
    return result


@router.delete("/database")
async def disconnect_database(
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == current_tenant.id))
    tenant = result.scalar_one()
    settings_data = dict(tenant.settings or {})
    settings_data.pop("external_db_url", None)
    tenant.settings = settings_data
    await db.commit()
    return {"ok": True}
