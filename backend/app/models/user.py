import uuid

from sqlalchemy import Boolean, DateTime, String
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
)

# Roles 2-5 above are the four approver roles used only by the multi-signature
# deletion-approval gate -- they don't grant any other access beyond that.
APPROVER_ROLES = ("chief_auditor", "compliance_officer", "security_officer", "executive_authority")


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "app"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    password_salt: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(32))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True))
