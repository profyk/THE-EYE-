from datetime import datetime

from pydantic import BaseModel


class CountryCount(BaseModel):
    country: str
    count: int


class TopIp(BaseModel):
    ip: str
    count: int
    country: str
    city: str | None


class IntrusionAttempt(BaseModel):
    ip: str | None
    country: str
    city: str | None
    latitude: float | None
    longitude: float | None
    event_type: str
    actor_id: str | None
    occurred_at: datetime


class IntrusionStats(BaseModel):
    total_attempts: int
    unique_ips: int
    countries: list[CountryCount]
    top_ips: list[TopIp]
    attempts: list[IntrusionAttempt]
