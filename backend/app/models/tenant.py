import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.api_key import ApiKey
    from app.models.plan import Plan


class Tenant(Base):
    __tablename__ = "tenants"
    __table_args__ = {"schema": "app"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True))
    paddle_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    paddle_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    paddle_subscription_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("app.plans.id", ondelete="SET NULL"),
        nullable=True,
    )

    api_keys: Mapped[list["ApiKey"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan", lazy="selectin"
    )
    plan: Mapped["Plan | None"] = relationship(back_populates="tenants", lazy="selectin")
