"""File activity, audit trail, and event-flagging endpoints.

File activity  — GET /v1/file-activity   (file_activity + data_exfiltration categories)
USB events     — GET /v1/usb-events      (removable_media category)
Audit trail    — GET /v1/audit-trail     (cross-category subject search)
Flag event     — POST/GET/DELETE /v1/events/{id}/flag*
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import String, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_role, require_tenant_id
from app.models.event_flag import EventFlag
from app.models.ledger_event import LedgerEvent
from app.models.user import User
from app.schemas.event import EventRead
from app.services.event_search import agent_source_filter, build_event_search_stmt

router = APIRouter(prefix="/v1", tags=["file-activity"])

# ── Schemas ───────────────────────────────────────────────────────────────────

FLAG_TYPES = Literal["suspicious", "unlawful", "evidence", "cleared"]


class FlagCreate(BaseModel):
    flag_type: FLAG_TYPES
    note: str | None = Field(default=None, max_length=2000)


class FlagRead(BaseModel):
    id: UUID
    event_id: UUID
    flag_type: str
    note: str | None
    flagged_by_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── File Activity ─────────────────────────────────────────────────────────────

@router.get(
    "/file-activity",
    response_model=list[EventRead],
    dependencies=[Depends(require_role("admin", "investigator", "super_admin"))],
)
async def get_file_activity(
    actor_id: str | None = None,
    host: str | None = None,
    operation: str | None = Query(
        default=None,
        description="Filter by event_type prefix, e.g. file.deleted or file.copied_to_usb",
    ),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(require_tenant_id),
) -> list[EventRead]:
    """Real-time feed of file-system events: creates, deletes, modifications,
    renames, USB copies. Shows only events collected by the agent."""
    stmt = build_event_search_stmt(
        tenant_id=tenant_id,
        actor_id=actor_id,
        event_type=operation,
    )
    # Restrict to file_activity + data_exfiltration categories
    stmt = stmt.where(
        LedgerEvent.event_category.in_(["file_activity", "data_exfiltration"])
    )
    if host:
        stmt = stmt.where(
            cast(LedgerEvent.metadata_["host"].astext, String).ilike(f"%{host}%")
        )
    stmt = stmt.limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [EventRead.model_validate(r) for r in rows]


# ── USB Events ────────────────────────────────────────────────────────────────

@router.get(
    "/usb-events",
    response_model=list[EventRead],
    dependencies=[Depends(require_role("admin", "investigator", "super_admin"))],
)
async def get_usb_events(
    host: str | None = None,
    actor_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(require_tenant_id),
) -> list[EventRead]:
    """USB connection events and files copied to removable media."""
    stmt = build_event_search_stmt(tenant_id=tenant_id, actor_id=actor_id)
    stmt = stmt.where(
        LedgerEvent.event_category.in_(["removable_media", "data_exfiltration"])
    )
    if host:
        stmt = stmt.where(
            cast(LedgerEvent.metadata_["host"].astext, String).ilike(f"%{host}%")
        )
    stmt = stmt.limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [EventRead.model_validate(r) for r in rows]


# ── Audit Trail ───────────────────────────────────────────────────────────────

@router.get(
    "/audit-trail",
    response_model=list[EventRead],
    dependencies=[Depends(require_role("admin", "investigator", "super_admin"))],
)
async def get_audit_trail(
    subject: str = Query(
        description="Person name, file name, document reference, or machine hostname to back-trail",
        min_length=2,
    ),
    machine: str | None = None,
    from_dt: datetime | None = Query(default=None, alias="from"),
    to_dt: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(require_tenant_id),
) -> list[EventRead]:
    """Chronological audit trail for a subject — person, file, document, or machine.

    Searches actor_id, target_id, and the metadata JSONB fields (file_name,
    host, document_ref, drive_label) so a query like 'passport application'
    surfaces all events touching a file by that name, and 'Kabelo' surfaces
    everything Kabelo did across all machines."""
    like = f"%{subject}%"

    stmt = (
        select(LedgerEvent)
        .where(
            LedgerEvent.tenant_id == tenant_id,
            agent_source_filter(tenant_id),
            or_(
                LedgerEvent.actor_id.ilike(like),
                LedgerEvent.target_id.ilike(like),
                cast(LedgerEvent.metadata_["file_name"].astext, String).ilike(like),
                cast(LedgerEvent.metadata_["host"].astext, String).ilike(like),
                cast(LedgerEvent.metadata_["document_ref"].astext, String).ilike(like),
                cast(LedgerEvent.metadata_["task_name"].astext, String).ilike(like),
                cast(LedgerEvent.metadata_["drive_label"].astext, String).ilike(like),
            ),
        )
        .order_by(LedgerEvent.occurred_at.asc())
    )

    if machine:
        stmt = stmt.where(
            cast(LedgerEvent.metadata_["host"].astext, String).ilike(f"%{machine}%")
        )
    if from_dt:
        stmt = stmt.where(LedgerEvent.occurred_at >= from_dt)
    if to_dt:
        stmt = stmt.where(LedgerEvent.occurred_at <= to_dt)

    stmt = stmt.limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [EventRead.model_validate(r) for r in rows]


# ── Event Flagging ────────────────────────────────────────────────────────────

@router.post(
    "/events/{event_id}/flags",
    response_model=FlagRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin", "investigator", "super_admin"))],
)
async def flag_event(
    event_id: UUID,
    body: FlagCreate,
    user: User = Depends(require_role("admin", "investigator", "super_admin")),
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(require_tenant_id),
) -> FlagRead:
    """Flag a ledger event as suspicious, unlawful, evidence, or cleared.

    Flags are stored in a separate table — the immutable hash-chained ledger
    is never modified. Multiple admins can each flag the same event."""
    # Confirm event belongs to this tenant
    ev = (
        await db.execute(
            select(LedgerEvent).where(
                LedgerEvent.id == event_id,
                LedgerEvent.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if ev is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")

    flag = EventFlag(
        event_id=event_id,
        tenant_id=tenant_id,
        flagged_by=user.id,
        flagged_by_name=user.username,
        flag_type=body.flag_type,
        note=body.note,
        created_at=datetime.now(UTC),
    )
    db.add(flag)
    await db.commit()
    await db.refresh(flag)
    return FlagRead.model_validate(flag)


@router.get(
    "/events/{event_id}/flags",
    response_model=list[FlagRead],
    dependencies=[Depends(require_role("admin", "investigator", "super_admin"))],
)
async def get_event_flags(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(require_tenant_id),
) -> list[FlagRead]:
    """Return all flags on an event, newest first."""
    rows = (
        await db.execute(
            select(EventFlag)
            .where(EventFlag.event_id == event_id, EventFlag.tenant_id == tenant_id)
            .order_by(EventFlag.created_at.desc())
        )
    ).scalars().all()
    return [FlagRead.model_validate(r) for r in rows]


@router.delete(
    "/events/{event_id}/flags/{flag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_flag(
    event_id: UUID,
    flag_id: UUID,
    user: User = Depends(require_role("admin", "super_admin")),
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(require_tenant_id),
) -> None:
    """Remove a flag (admin only — investigators can add but not remove)."""
    flag = (
        await db.execute(
            select(EventFlag).where(
                EventFlag.id == flag_id,
                EventFlag.event_id == event_id,
                EventFlag.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if flag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Flag not found")
    await db.delete(flag)
    await db.commit()
