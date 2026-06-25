import uuid

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

DEFAULT_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")


class LedgerEvent(Base):
    """Append-only, hash-chained audit record. Never UPDATE or DELETE this table —
    the DB grants and triggers (migration 0004) enforce that at the database level."""

    __tablename__ = "events"
    __table_args__ = {"schema": "ledger"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sequence_num: Mapped[int] = mapped_column(BigInteger, unique=True)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=DEFAULT_TENANT_ID)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("app.ingestion_sources.id"))

    actor_type: Mapped[str] = mapped_column(String(32))
    actor_id: Mapped[str] = mapped_column(String(256))
    actor_display_name: Mapped[str | None] = mapped_column(String(256), nullable=True)

    event_type: Mapped[str] = mapped_column(String(128))
    event_category: Mapped[str] = mapped_column(String(32))
    outcome: Mapped[str] = mapped_column(String(16))
    severity: Mapped[str] = mapped_column(String(16), default="info")

    origin_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    origin_ip: Mapped[str | None] = mapped_column(INET, nullable=True)
    origin_application: Mapped[str | None] = mapped_column(String(255), nullable=True)

    occurred_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True))
    received_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True))

    target_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    change_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    prev_hash: Mapped[str] = mapped_column(String(64))
    record_hash: Mapped[str] = mapped_column(String(64))

    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True))
