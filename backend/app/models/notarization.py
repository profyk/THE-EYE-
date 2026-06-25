import uuid

from sqlalchemy import BigInteger, DateTime, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Notarization(Base):
    """Periodic external tamper-evidence snapshot of the chain head. Phase 1 only
    ever writes notarization_provider='local-only'; real RFC3161/OpenTimestamps
    integration is a Phase 2/3 addition that reuses this same table."""

    __tablename__ = "notarizations"
    __table_args__ = {"schema": "ledger"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_sequence_num: Mapped[int] = mapped_column(BigInteger)
    to_sequence_num: Mapped[int] = mapped_column(BigInteger)
    root_hash: Mapped[str] = mapped_column(String(64))
    notarization_provider: Mapped[str] = mapped_column(String(32), default="local-only")
    provider_receipt: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True))
