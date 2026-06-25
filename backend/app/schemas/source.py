from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class SourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    source_kind: Literal["db_trigger", "api_hook", "log_forwarder", "agent", "manual"]


class SourceCreated(BaseModel):
    id: UUID
    name: str
    source_kind: str
    api_key: str  # plaintext key -- returned exactly once, never stored or shown again
    api_key_prefix: str


class SourceRead(BaseModel):
    id: UUID
    name: str
    source_kind: str
    api_key_prefix: str
    is_active: bool
    created_at: datetime
    last_seen_at: datetime | None

    model_config = {"from_attributes": True}
