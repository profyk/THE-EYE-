from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

WhistleblowerCategory = Literal["corruption", "fraud", "safety", "abuse_of_power", "other"]


class WhistleblowerSubmission(BaseModel):
    report: str = Field(min_length=1, max_length=4000)
    category: WhistleblowerCategory = "other"


class WhistleblowerAck(BaseModel):
    received: bool = True


class WhistleblowerReportRead(BaseModel):
    id: UUID
    category: str
    report_text: str
    created_at: datetime

    model_config = {"from_attributes": True}
