from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role
from app.schemas.event import EventRead
from app.schemas.investigate import InvestigateRequest, InvestigateResponse
from app.services.event_search import search_events_raw
from app.services.llm_service import LLMNotConfiguredError, extract_search_filters, generate_report

router = APIRouter(prefix="/v1", tags=["investigate"], dependencies=[Depends(require_role("admin", "investigator"))])


@router.post("/investigate", response_model=InvestigateResponse)
async def investigate(body: InvestigateRequest, db: AsyncSession = Depends(get_db)) -> InvestigateResponse:
    try:
        filters = await extract_search_filters(body.question)
        rows = await search_events_raw(db, limit=200, **filters)
        events = [EventRead.model_validate(r) for r in rows]
        report_text = await generate_report(body.question, events)
    except LLMNotConfiguredError:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AI investigate is not configured -- set ANTHROPIC_API_KEY in the backend environment to enable it.",
        )
    except RuntimeError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"AI service error: {e}")

    return InvestigateResponse(
        filters_used=filters, matched_count=len(events), report_text=report_text, events=events
    )
