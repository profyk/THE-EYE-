import json
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, IPvAnyAddress, field_validator, model_validator

from app.config import settings

EVENT_CATEGORIES = Literal[
    "authentication",
    "authorization",
    "data_access",
    "data_modification",
    "configuration",
    "process_execution",
    "network",
    "financial_transaction",
    "administrative",
    "system",
]

# Defense-in-depth backstop against accidental content capture. The primary
# control is documentation + integration review of each source -- this denylist
# just catches the obvious cases (e.g. a forwarder accidentally including a raw
# HTTP body or a screenshot field) before they ever land in the immutable ledger,
# since ledger rows can never be edited or deleted afterward.
FORBIDDEN_METADATA_KEYS = {
    "keystrokes",
    "screen_capture",
    "screenshot",
    "raw_content",
    "message_body",
    "file_contents",
    "password",
    "clipboard",
}


def _contains_forbidden_keys(value: Any, forbidden: set[str]) -> bool:
    if isinstance(value, dict):
        for key, sub_value in value.items():
            if isinstance(key, str) and key.lower() in forbidden:
                return True
            if _contains_forbidden_keys(sub_value, forbidden):
                return True
    elif isinstance(value, list):
        return any(_contains_forbidden_keys(item, forbidden) for item in value)
    return False


def _payload_too_large(value: Any, max_bytes: int) -> bool:
    return len(json.dumps(value).encode("utf-8")) > max_bytes


class EventCreate(BaseModel):
    occurred_at: datetime

    actor_type: Literal["user", "service_account", "system", "unknown"]
    actor_id: str = Field(min_length=1, max_length=256)
    actor_display_name: str | None = Field(default=None, max_length=256)

    event_type: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9_]+\.[a-z0-9_]+$")
    event_category: EVENT_CATEGORIES
    outcome: Literal["success", "failure", "denied", "unknown"]
    severity: Literal["debug", "info", "warning", "high", "critical"] = "info"

    origin_host: str | None = Field(default=None, max_length=255)
    origin_ip: IPvAnyAddress | None = None
    origin_application: str | None = Field(default=None, max_length=255)

    target_type: str | None = Field(default=None, max_length=128)
    target_id: str | None = Field(default=None, max_length=512)
    change_summary: dict[str, Any] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("change_summary", "metadata")
    @classmethod
    def reject_raw_content_fields(cls, v: Any) -> Any:
        if v is None:
            return v
        if _contains_forbidden_keys(v, FORBIDDEN_METADATA_KEYS):
            raise ValueError(
                "metadata/change_summary must not contain raw content fields "
                f"(forbidden keys: {sorted(FORBIDDEN_METADATA_KEYS)})"
            )
        if _payload_too_large(v, settings.max_metadata_bytes):
            raise ValueError(
                f"metadata/change_summary exceeds {settings.max_metadata_bytes} byte limit "
                "-- this looks like content capture, not a system event"
            )
        return v

    @model_validator(mode="after")
    def validate_occurred_at_window(self) -> "EventCreate":
        now = datetime.now(timezone.utc)
        occurred = self.occurred_at if self.occurred_at.tzinfo else self.occurred_at.replace(tzinfo=timezone.utc)
        if occurred > now + timedelta(minutes=settings.max_future_skew_minutes):
            raise ValueError("occurred_at is too far in the future")
        if occurred < now - timedelta(days=settings.max_backdate_days):
            raise ValueError("occurred_at is too far in the past")
        return self


class EventBatchCreate(BaseModel):
    events: list[EventCreate] = Field(min_length=1, max_length=settings.max_batch_size)


class EventAck(BaseModel):
    id: UUID
    sequence_num: int
    record_hash: str
    received_at: datetime


class EventBatchResult(BaseModel):
    index: int
    errors: list[str]


class EventBatchAck(BaseModel):
    results: list[EventAck]
    failed: list[EventBatchResult] = Field(default_factory=list)


class EventRead(BaseModel):
    id: UUID
    sequence_num: int
    tenant_id: UUID
    source_id: UUID
    actor_type: str
    actor_id: str
    actor_display_name: str | None
    event_type: str
    event_category: str
    outcome: str
    severity: str
    origin_host: str | None
    origin_ip: str | None
    origin_application: str | None
    occurred_at: datetime
    received_at: datetime
    target_type: str | None
    target_id: str | None
    change_summary: dict[str, Any] | None
    metadata: dict[str, Any] = Field(validation_alias="metadata_")
    prev_hash: str
    record_hash: str

    @field_validator("origin_ip", mode="before")
    @classmethod
    def _coerce_origin_ip(cls, v: Any) -> Any:
        # asyncpg returns Postgres INET columns as ipaddress.IPv4Address/
        # IPv6Address objects, not str -- only surfaces once a real IP is
        # actually stored and read back (every prior test used a null IP).
        return str(v) if v is not None else v

    model_config = {"from_attributes": True, "populate_by_name": True}


class EventSearchParams(BaseModel):
    actor_id: str | None = None
    event_type: str | None = None
    event_category: str | None = None
    outcome: str | None = None
    source_id: UUID | None = None
    occurred_from: datetime | None = None
    occurred_to: datetime | None = None
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)
