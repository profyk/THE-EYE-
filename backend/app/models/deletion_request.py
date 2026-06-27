import uuid

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# These four roles are the only ones that count as approvers -- a request
# needs exactly one approval from each before it executes, matching the
# prototype's four-signature concept (Chief Auditor / Compliance Officer /
# Security Officer / Executive Authority).
APPROVER_ROLES = ("chief_auditor", "compliance_officer", "security_officer", "executive_authority")


class DeletionRequest(Base):
    __tablename__ = "deletion_requests"
    __table_args__ = {"schema": "app"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("app.tenants.id"))
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("app.users.id"))
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True))


class DeletionApproval(Base):
    __tablename__ = "deletion_approvals"
    __table_args__ = {"schema": "app"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("app.deletion_requests.id"))
    approver_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("app.users.id"))
    approver_role: Mapped[str] = mapped_column(String(32))
    decision: Mapped[str] = mapped_column(String(16))
    decided_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True))
