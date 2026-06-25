from datetime import datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.models.ledger_event import LedgerEvent


def build_event_search_stmt(
    *,
    actor_id: str | None = None,
    event_type: str | None = None,
    event_category: str | None = None,
    outcome: str | None = None,
    source_id: UUID | None = None,
    q: str | None = None,
    occurred_from: datetime | str | None = None,
    occurred_to: datetime | str | None = None,
) -> Select:
    # asyncpg needs a real datetime for timestamptz comparisons, not a raw
    # string -- callers (e.g. the AI investigate filter extraction) may pass
    # ISO strings, so normalize here once rather than in every caller.
    if isinstance(occurred_from, str):
        occurred_from = datetime.fromisoformat(occurred_from)
    if isinstance(occurred_to, str):
        occurred_to = datetime.fromisoformat(occurred_to)

    stmt = select(LedgerEvent).order_by(LedgerEvent.sequence_num.desc())

    if actor_id:
        stmt = stmt.where(LedgerEvent.actor_id == actor_id)
    if event_type:
        stmt = stmt.where(LedgerEvent.event_type == event_type)
    if event_category:
        stmt = stmt.where(LedgerEvent.event_category == event_category)
    if outcome:
        stmt = stmt.where(LedgerEvent.outcome == outcome)
    if source_id:
        stmt = stmt.where(LedgerEvent.source_id == source_id)
    if occurred_from:
        stmt = stmt.where(LedgerEvent.occurred_at >= occurred_from)
    if occurred_to:
        stmt = stmt.where(LedgerEvent.occurred_at <= occurred_to)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                LedgerEvent.actor_id.ilike(pattern),
                LedgerEvent.event_type.ilike(pattern),
                LedgerEvent.target_id.ilike(pattern),
            )
        )

    return stmt


async def search_events_raw(db: AsyncSession, *, limit: int = 500, offset: int = 0, **filters) -> list[LedgerEvent]:
    stmt = build_event_search_stmt(**filters).limit(limit).offset(offset)
    return list((await db.execute(stmt)).scalars().all())
