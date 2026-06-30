import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EventFlag(Base):
    """Admin annotation on a ledger event — suspicious, unlawful, cleared, evidence.

    Stored in a separate table so the immutable hash-chained ledger is never
    touched; flags are mutable metadata layered on top without breaking the chain."""

    __tablename__ = "event_flags"
    __table_args__ = {"schema": "app"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    flagged_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app.users.id", ondelete="SET NULL"), nullable=True
    )
    flagged_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    flag_type: Mapped[str] = mapped_column(String(32))  # suspicious | unlawful | evidence | cleared
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
