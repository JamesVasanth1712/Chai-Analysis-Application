from sqlalchemy import String, Integer, Text, Boolean, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Dashboard(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "dashboards"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    layout_config: Mapped[dict] = mapped_column(JSON, default=dict)

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True, nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    widgets: Mapped[list["DashboardWidget"]] = relationship(
        "DashboardWidget", back_populates="dashboard", cascade="all, delete-orphan"
    )


class DashboardWidget(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "dashboard_widgets"

    title: Mapped[str] = mapped_column(String(255), nullable=False, default="Chart")
    chart_type: Mapped[str] = mapped_column(String(50), default="bar")  # line|bar|pie|area|table
    query_sql: Mapped[str] = mapped_column(Text, nullable=True)
    query_nl: Mapped[str] = mapped_column(Text, nullable=True)
    x_key: Mapped[str] = mapped_column(String(100), nullable=True)
    y_keys: Mapped[list] = mapped_column(JSON, default=list)
    position_x: Mapped[int] = mapped_column(Integer, default=0)
    position_y: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int] = mapped_column(Integer, default=6)
    height: Mapped[int] = mapped_column(Integer, default=4)
    refresh_interval_s: Mapped[int] = mapped_column(Integer, nullable=True)
    date_filter_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    dataset_id: Mapped[str] = mapped_column(String(36), nullable=True)

    dashboard_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("dashboards.id"), index=True, nullable=False
    )
    dashboard: Mapped["Dashboard"] = relationship("Dashboard", back_populates="widgets")
