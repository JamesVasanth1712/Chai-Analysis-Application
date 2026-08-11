from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from app.api.deps import get_current_user, get_current_tenant, require_admin
from app.core.database import get_db
from app.core.security import hash_password
from app.models.user import User
from app.models.tenant import Tenant

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "analyst"


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    permissions: Optional[List[str]] = None


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "tenant_id": current_user.tenant_id,
        "preferred_language": current_user.preferred_language,
    }


@router.get("/", dependencies=[Depends(require_admin)])
async def list_users(
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.tenant_id == current_tenant.id).order_by(User.created_at)
    )
    users = result.scalars().all()
    return [{"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active} for u in users]


@router.post("/", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_user(
    body: UserCreate,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        tenant_id=current_tenant.id,
    )
    db.add(user)
    await db.commit()
    return {"id": user.id, "email": user.email}


@router.patch("/{user_id}", dependencies=[Depends(require_admin)])
async def update_user(
    user_id: str,
    body: UserUpdate,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_tenant.id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for field, value in body.dict(exclude_none=True).items():
        setattr(user, field, value)
    await db.commit()
    return {"id": user_id, "updated": True}


class InvitationCreate(BaseModel):
    email: EmailStr
    role: str = "viewer"


@router.get("/invitations/all", dependencies=[Depends(require_admin)])
async def list_invitations(
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    from app.models.extensions import TeamInvitation
    result = await db.execute(
        select(TeamInvitation).where(TeamInvitation.tenant_id == current_tenant.id)
    )
    invites = result.scalars().all()
    return [
        {
            "id": i.id,
            "email": i.email,
            "role": i.role,
            "status": i.status,
            "created_at": i.created_at.isoformat() if i.created_at else None,
        }
        for i in invites
    ]


@router.post("/invitations", dependencies=[Depends(require_admin)])
async def create_invitation(
    body: InvitationCreate,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    from app.models.extensions import TeamInvitation
    
    user_exists = await db.execute(select(User).where(User.email == body.email))
    if user_exists.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User already registered in system")
        
    invite_exists = await db.execute(
        select(TeamInvitation).where(TeamInvitation.email == body.email, TeamInvitation.status == "pending")
    )
    if invite_exists.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Pending invitation already exists for this email")

    invitation = TeamInvitation(
        email=body.email,
        role=body.role,
        status="pending",
        token=str(uuid.uuid4()),
        tenant_id=current_tenant.id,
    )
    db.add(invitation)
    await db.commit()
    return {"status": "success", "invitation_id": invitation.id}


@router.delete("/invitations/{invitation_id}", dependencies=[Depends(require_admin)])
async def revoke_invitation(
    invitation_id: str,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    from app.models.extensions import TeamInvitation
    result = await db.execute(
        select(TeamInvitation).where(
            TeamInvitation.id == invitation_id,
            TeamInvitation.tenant_id == current_tenant.id
        )
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
        
    await db.delete(invitation)
    await db.commit()
    return {"status": "success"}
