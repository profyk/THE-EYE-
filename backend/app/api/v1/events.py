import csv
import io
import json
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_source, get_db, require_role
from app.ledger.append import append_batch, append_event
from app.models.ingestion_source import IngestionSource
from app.models.ledger_event import LedgerEvent
from app.schemas.event import (
    EventAck,
    EventBatchAck,
    EventBatchCreate,
    EventCreate,
    EventRead,
)
from app.services.event_search import build_event_search_stmt

router = APIRouter(prefix="/v1", tags=["events"])


def _to_ack(row: LedgerEvent) -> EventAck:
    return EventAck(
        id=row.id,
        sequence_num=row.sequence_num,
        record_hash=row.record_hash,
        received_at=row.received_at,
    )


@router.post("/events", response_model=EventAck, status_code=status.HTTP_201_CREATED)
async def submit_event(
    event: EventCreate,
    source: IngestionSource = Depends(get_current_source),
    db: AsyncSession = Depends(get_db),
) -> EventAck:
    row = await append_event(db, event, source_id=source.id)
    await db.commit()
    return _to_ack(row)


@router.post("/events/batch", response_model=EventBatchAck, status_code=status.HTTP_201_CREATED)
async def submit_event_batch(
    batch: EventBatchCreate,
    source: IngestionSource = Depends(get_current_source),
    db: AsyncSession = Depends(get_db),
) -> EventBatchAck:
    try:
        rows = await append_batch(db, batch.events, source_id=source.id)
    except Exception:
        await db.rollback()
        raise
    await db.commit()
    return EventBatchAck(results=[_to_ack(r) for r in rows], failed=[])


def _json_default(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


@router.get("/events/export", dependencies=[Depends(require_role("admin", "investigator"))])
async def export_events(
    actor_id: str | None = None,
    event_type: str | None = None,
    event_category: str | None = None,
    outcome: str | None = None,
    source_id: UUID | None = None,
    q: str | None = None,
    format: Literal["csv", "json"] = "csv",
    limit: int = Query(default=500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Evidence export, for the forensics suite's NPA-submission-prep flow.
    No new dependency: CSV via stdlib csv, JSON via json.dumps -- the same
    data the dashboard search already shows, packaged for download.

    Registered before /events/{event_id} below: a plain {event_id} path
    param would otherwise greedily match the literal segment "export" first,
    since Starlette matches routes in registration order."""
    stmt = build_event_search_stmt(
        actor_id=actor_id, event_type=event_type, event_category=event_category, outcome=outcome,
        source_id=source_id, q=q,
    ).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    records = [EventRead.model_validate(r).model_dump() for r in rows]

    if format == "json":
        content = json.dumps(records, default=_json_default, indent=2)
        media_type = "application/json"
        filename = "the-eye-evidence-export.json"
    else:
        buffer = io.StringIO()
        if records:
            writer = csv.DictWriter(buffer, fieldnames=list(records[0].keys()))
            writer.writeheader()
            for record in records:
                writer.writerow({k: (json.dumps(v) if isinstance(v, dict) else v) for k, v in record.items()})
        content = buffer.getvalue()
        media_type = "text/csv"
        filename = "the-eye-evidence-export.csv"

    return StreamingResponse(
        iter([content]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/events/{event_id}",
    response_model=EventRead,
    dependencies=[Depends(require_role("admin", "investigator"))],
)
async def get_event(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EventRead:
    row = (await db.execute(select(LedgerEvent).where(LedgerEvent.id == event_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return EventRead.model_validate(row)


@router.get(
    "/events",
    response_model=list[EventRead],
    dependencies=[Depends(require_role("admin", "investigator"))],
)
async def search_events(
    actor_id: str | None = None,
    event_type: str | None = None,
    event_category: str | None = None,
    outcome: str | None = None,
    source_id: UUID | None = None,
    q: str | None = Query(default=None, description="Free-text search across actor_id, event_type, target_id"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[EventRead]:
    stmt = build_event_search_stmt(
        actor_id=actor_id, event_type=event_type, event_category=event_category, outcome=outcome,
        source_id=source_id, q=q,
    ).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [EventRead.model_validate(r) for r in rows]


@router.get("/sources/me")
async def whoami(source: IngestionSource = Depends(get_current_source)) -> dict:
    return {
        "id": str(source.id),
        "name": source.name,
        "source_kind": source.source_kind,
        "is_active": source.is_active,
    }
