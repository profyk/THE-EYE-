import uuid

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WhistleblowerReport(Base):
    """Full report text lives here, not in the immutable ledger -- this is a
    plain, deletable table so the content itself can be legally redacted
    later without touching the hash chain. The ledger event for a submission
    only ever stores this row's id and a content hash (see whistleblower.py),
    which is enough to prove tamper-evidently that a report with this exact
    content was filed at this time."""

    __tablename__ = "whistleblower_reports"
    __table_args__ = {"schema": "app"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category: Mapped[str] = mapped_column(String(32))
    report_text: Mapped[str] = mapped_column(Text)
    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True))
