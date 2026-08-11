from sqlalchemy import String, Boolean, ForeignKey, JSON, Text, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin
from datetime import datetime
from typing import List, Optional


class DashboardTemplate(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "dashboard_templates"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    layout_config: Mapped[dict] = mapped_column(JSON, default=dict)


class ScheduledReport(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "scheduled_reports"

    frequency: Mapped[str] = mapped_column(String(50), nullable=False)  # daily|weekly|monthly
    recipients: Mapped[List[str]] = mapped_column(JSON, default=list)  # list of email strings
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    dashboard_id: Mapped[str] = mapped_column(String(36), ForeignKey("dashboards.id", ondelete="CASCADE"), index=True, nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)


class QueryHistory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "query_histories"

    sql_query: Mapped[str] = mapped_column(Text, nullable=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    execution_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    dataset_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)


class DatabaseConnector(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "database_connectors"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # postgresql|mysql|sqlserver|mongodb|duckdb
    credentials: Mapped[dict] = mapped_column(JSON, default=dict)  # connection details (host, port, dbname, user, password)

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)


class TeamInvitation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "team_invitations"

    email: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="viewer")
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending|accepted|expired
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
