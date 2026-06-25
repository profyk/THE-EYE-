from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class AlertRead(BaseModel):
    key: str
    rule_id: str
    rule_name: str
    severity: str
    actor_id: str
    message: str
    detected_at: datetime
    status: str
    acknowledged_by: str | None
    acknowledged_at: datetime | None


class AlertActionRequest(BaseModel):
    rule_id: str
    actor_id: str
    action: Literal["acknowledged", "escalated"]
