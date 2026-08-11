from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.api.deps import get_current_user, get_current_tenant
from app.core.database import get_db
from app.services.analysis_service import analyze_message
from app.models.user import User
from app.models.tenant import Tenant
from app.models.conversation import Conversation, Message
from app.models.audit import AuditLog
import structlog

logger = structlog.get_logger()
router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    data: Optional[dict] = None


class ChatResponse(BaseModel):
    conversation_id: str
    message_id: str
    agent_used: str
    response: dict


@router.post("/", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    # Get or create conversation
    if body.conversation_id:
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == body.conversation_id,
                Conversation.tenant_id == current_tenant.id,
            )
        )
        conversation = result.scalar_one_or_none()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        conversation = Conversation(
            tenant_id=current_tenant.id,
            user_id=current_user.id,
            title=body.message[:80],
        )
        db.add(conversation)
        await db.flush()

    # Save user message
    user_msg = Message(
        conversation_id=conversation.id,
        role="user",
        content=body.message,
    )
    db.add(user_msg)
    await db.flush()

    dataset_id = (body.data or {}).get("dataset_id")
    dashboard_id = (body.data or {}).get("dashboard_id")
    try:
        response = await analyze_message(
            message=body.message,
            tenant_id=current_tenant.id,
            user_id=current_user.id,
            db=db,
            dataset_id=dataset_id,
            dashboard_id=dashboard_id,
            conversation_id=conversation.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Save assistant message
    assistant_msg = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=response.get("executive_summary", ""),
        agent_used="analysis",
        structured_response=response,
    )
    db.add(assistant_msg)

    # Audit log
    audit = AuditLog(
        action="chat",
        resource_type="conversation",
        resource_id=conversation.id,
        tenant_id=current_tenant.id,
        user_id=current_user.id,
    )
    db.add(audit)
    await db.commit()

    return ChatResponse(
        conversation_id=conversation.id,
        message_id=assistant_msg.id,
        agent_used="analysis",
        response=response,
    )


@router.get("/conversations")
async def list_conversations(
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.tenant_id == current_tenant.id, Conversation.user_id == current_user.id)
        .order_by(Conversation.created_at.desc())
        .limit(50)
    )
    convos = result.scalars().all()
    return [{"id": c.id, "title": c.title, "created_at": c.created_at.isoformat()} for c in convos]


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == current_tenant.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    msgs = await db.execute(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at)
    )
    messages = msgs.scalars().all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "agent_used": m.agent_used,
            "structured_response": m.structured_response,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]
