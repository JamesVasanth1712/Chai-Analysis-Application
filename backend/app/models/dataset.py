from sqlalchemy import String, Integer, Text, Boolean, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Dataset(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "datasets"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_format: Mapped[str] = mapped_column(String(20), nullable=False)  # csv|xlsx|xls
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    column_names: Mapped[list] = mapped_column(JSON, default=list)
    column_types: Mapped[dict] = mapped_column(JSON, default=dict)
    table_name: Mapped[str] = mapped_column(String(100), nullable=False)  # ds_<uuid>
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending|ready|failed
    error_message: Mapped[str] = mapped_column(Text, nullable=True)

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True, nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    dashboard_id: Mapped[str] = mapped_column(String(36), ForeignKey("dashboards.id"), index=True, nullable=True)
