import uuid

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AlertAcknowledgment(Base):
    __tablename__ = "alert_acknowledgments"
    __table_args__ = {"schema": "app"}

    alert_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("app.tenants.id"))
    rule_id: Mapped[str] = mapped_column(String(64))
    actor_id: Mapped[str] = mapped_column(String(256))
    status: Mapped[str] = mapped_column(String(16))
    acknowledged_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("app.users.id"))
    acknowledged_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True))
