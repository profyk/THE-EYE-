from datetime import datetime

from pydantic import BaseModel


class CountryCount(BaseModel):
    country: str
    count: int


class IntrusionAttempt(BaseModel):
    ip: str | None
    country: str
    city: str | None
    latitude: float | None
    longitude: float | None
    event_type: str
    occurred_at: datetime


class IntrusionStats(BaseModel):
    total_attempts: int
    countries: list[CountryCount]
    attempts: list[IntrusionAttempt]
