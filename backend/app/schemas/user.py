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
]


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    role: Role


class SetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=256)


class UserRead(BaseModel):
    id: UUID
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
