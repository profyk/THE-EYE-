from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Role = Literal[
    "admin",
    "investigator",
    "chief_auditor",
    "compliance_officer",
    "security_officer",
    "executive_authority",
    "super_admin",
]


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    role: Role
    # Optional: defaults to the bootstrap tenant for any non-super_admin
    # role (see user_service.create_user) so existing call sites that don't
    # pass this keep working unchanged.
    tenant_id: UUID | None = None


class SetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=256)


class UserRead(BaseModel):
    id: UUID
    tenant_id: UUID | None
    username: str
    role: Role
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    username: str
    role: Role
    tenant_id: UUID | None = None
