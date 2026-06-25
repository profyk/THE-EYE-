from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class DeletionRequestCreate(BaseModel):
    target_type: Literal["user", "ingestion_source"]
    target_id: UUID
    reason: str = Field(min_length=1, max_length=2000)


class DeletionApprovalRead(BaseModel):
    approver_role: str
    decision: str
    decided_at: datetime


class DeletionRequestRead(BaseModel):
    id: UUID
    requested_by: UUID
    target_type: str
    target_id: UUID
    reason: str
    status: str
    created_at: datetime
    approvals: list[DeletionApprovalRead] = Field(default_factory=list)


class DeletionDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]
