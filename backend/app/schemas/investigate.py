from pydantic import BaseModel, Field

from app.schemas.event import EventRead


class InvestigateRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class InvestigateResponse(BaseModel):
    filters_used: dict
    matched_count: int
    report_text: str
    events: list[EventRead]
