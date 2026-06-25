from datetime import datetime

from pydantic import BaseModel


class OverviewStats(BaseModel):
    events_today: int
    critical_flags: int
    active_sources: int
    high_risk_users: int


class ActorRiskScore(BaseModel):
    actor_id: str
    risk_score: int
    total_events: int
    failed_count: int
    critical_count: int
    admin_count: int
    financial_count: int
    last_seen_at: datetime | None
