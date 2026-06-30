import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

ROLES = (
    "admin",
    "investigator",
    "chief_auditor",
    "compliance_officer",
    "security_officer",
    "executive_authority",
    "super_admin",
)

# super_admin is THE EYE's own staff -- cross-tenant, no tenant_id of their
# own. Every other role belongs to exactly one tenant.
TENANTLESS_ROLES = ("super_admin",)

# Roles 2-5 above are the four approver roles used only by the multi-signature
# deletion-approval gate -- they don't grant any other access beyond that.
APPROVER_ROLES = ("chief_auditor", "compliance_officer", "security_officer", "executive_authority")


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "app"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app.tenants.id"), nullable=True
    )
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    password_salt: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(32))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True))
