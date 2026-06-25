import uuid

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.ledger_event import DEFAULT_TENANT_ID


class IngestionSource(Base):
    """Mutable record of a system permitted to submit events (DB trigger, API hook,
    log forwarder, agent, or manual). Lives in the `app` schema, not `ledger` —
    keys get rotated/deactivated, so this table is normal CRUD, unlike ledger.events."""

    __tablename__ = "ingestion_sources"
    __table_args__ = {"schema": "app"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=DEFAULT_TENANT_ID)

    name: Mapped[str] = mapped_column(String(255))
    source_kind: Mapped[str] = mapped_column(String(32))

    api_key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    api_key_prefix: Mapped[str] = mapped_column(String(32), unique=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True), nullable=True)
