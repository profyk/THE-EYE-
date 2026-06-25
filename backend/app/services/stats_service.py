"""Real aggregate queries over the ledger -- backs the Overview dashboard and
the risk-scored Users view. No separate stats table: everything here is
computed from ledger.events, not pre-aggregated storage.

The risk-score query is a full GROUP BY scan across the whole (append-only,
ever-growing) events table, and both the Overview page and the Users page
call it on every load. A short TTL cache sits in front of it so many
concurrent dashboard users don't each trigger their own full scan -- a few
seconds of staleness on a risk score is a fine trade for not re-scanning the
whole ledger per request. Deliberately not using a lock to dedupe concurrent
recomputation on a cache miss: an occasional redundant scan at the TTL
boundary is cheap insurance against the complexity of that, not worth it yet.
"""
import time as time_module
from datetime import datetime, time, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion_source import IngestionSource
from app.models.ledger_event import LedgerEvent

_RISK_SCORE_CACHE_TTL_SECONDS = 20
# Keyed by tenant_id -- a single shared tuple here would leak one tenant's
# risk scores into another tenant's request once this query gained tenant
# filtering, since the cache previously assumed there was only ever one
# logical dataset.
_risk_score_cache: dict[UUID, tuple[float, list[dict]]] = {}

# Heuristic, transparent risk score -- not a trained model. Documented here so
# the weighting is visible and easy to tune; a real statistical baselining
# model is the Phase 3 upgrade path noted in the original roadmap.
WEIGHT_FAILED_OUTCOME = 5
WEIGHT_CRITICAL_SEVERITY = 10
WEIGHT_ADMINISTRATIVE = 3
WEIGHT_FINANCIAL = 2
MAX_RISK_SCORE = 100


async def get_overview_stats(db: AsyncSession, *, tenant_id: UUID) -> dict:
    start_of_today = datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)

    events_today = (
        await db.execute(
            select(func.count())
            .select_from(LedgerEvent)
            .where(LedgerEvent.occurred_at >= start_of_today, LedgerEvent.tenant_id == tenant_id)
        )
    ).scalar_one()

    critical_flags = (
        await db.execute(
            select(func.count())
            .select_from(LedgerEvent)
            .where(LedgerEvent.severity.in_(["high", "critical"]), LedgerEvent.tenant_id == tenant_id)
        )
    ).scalar_one()

    active_sources = (
        await db.execute(
            select(func.count())
            .select_from(IngestionSource)
            .where(IngestionSource.is_active.is_(True), IngestionSource.tenant_id == tenant_id)
        )
    ).scalar_one()

    risk_scores = await get_actor_risk_scores(db, tenant_id=tenant_id, limit=1000)
    high_risk_users = sum(1 for r in risk_scores if r["risk_score"] >= 50)

    return {
        "events_today": events_today,
        "critical_flags": critical_flags,
        "active_sources": active_sources,
        "high_risk_users": high_risk_users,
    }


async def _compute_actor_risk_scores(db: AsyncSession, *, tenant_id: UUID) -> list[dict]:
    stmt = (
        select(
            LedgerEvent.actor_id,
            func.count().label("total_events"),
            func.count().filter(LedgerEvent.outcome == "failure").label("failed_count"),
            func.count().filter(LedgerEvent.severity.in_(["high", "critical"])).label("critical_count"),
            func.count().filter(LedgerEvent.event_category == "administrative").label("admin_count"),
            func.count().filter(LedgerEvent.event_category == "financial_transaction").label("financial_count"),
            func.max(LedgerEvent.occurred_at).label("last_seen_at"),
        )
        .where(LedgerEvent.tenant_id == tenant_id)
        .group_by(LedgerEvent.actor_id)
        .order_by(func.count().desc())
    )
    rows = (await db.execute(stmt)).all()

    scored = []
    for row in rows:
        raw_score = (
            WEIGHT_FAILED_OUTCOME * row.failed_count
            + WEIGHT_CRITICAL_SEVERITY * row.critical_count
            + WEIGHT_ADMINISTRATIVE * row.admin_count
            + WEIGHT_FINANCIAL * row.financial_count
        )
        scored.append(
            {
                "actor_id": row.actor_id,
                "risk_score": min(MAX_RISK_SCORE, raw_score),
                "total_events": row.total_events,
                "failed_count": row.failed_count,
                "critical_count": row.critical_count,
                "admin_count": row.admin_count,
                "financial_count": row.financial_count,
                "last_seen_at": row.last_seen_at,
            }
        )

    scored.sort(key=lambda r: r["risk_score"], reverse=True)
    return scored


async def get_analytics(db: AsyncSession, *, tenant_id: UUID) -> dict:
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    total = (
        await db.execute(select(func.count()).select_from(LedgerEvent).where(LedgerEvent.tenant_id == tenant_id))
    ).scalar_one()

    day_rows = (
        await db.execute(
            select(func.date_trunc("day", LedgerEvent.occurred_at).label("day"), func.count().label("count"))
            .where(LedgerEvent.tenant_id == tenant_id, LedgerEvent.occurred_at >= thirty_days_ago)
            .group_by(func.date_trunc("day", LedgerEvent.occurred_at))
            .order_by(func.date_trunc("day", LedgerEvent.occurred_at))
        )
    ).all()

    cat_rows = (
        await db.execute(
            select(LedgerEvent.event_category, func.count().label("count"))
            .where(LedgerEvent.tenant_id == tenant_id)
            .group_by(LedgerEvent.event_category)
            .order_by(func.count().desc())
        )
    ).all()

    sev_rows = (
        await db.execute(
            select(LedgerEvent.severity, func.count().label("count"))
            .where(LedgerEvent.tenant_id == tenant_id)
            .group_by(LedgerEvent.severity)
            .order_by(func.count().desc())
        )
    ).all()

    type_rows = (
        await db.execute(
            select(LedgerEvent.event_type, func.count().label("count"))
            .where(LedgerEvent.tenant_id == tenant_id)
            .group_by(LedgerEvent.event_type)
            .order_by(func.count().desc())
            .limit(10)
        )
    ).all()

    outcome_rows = (
        await db.execute(
            select(LedgerEvent.outcome, func.count().label("count"))
            .where(LedgerEvent.tenant_id == tenant_id)
            .group_by(LedgerEvent.outcome)
            .order_by(func.count().desc())
        )
    ).all()

    hour_rows = (
        await db.execute(
            select(
                func.extract("hour", LedgerEvent.occurred_at).label("hour"),
                func.count().label("count"),
            )
            .where(LedgerEvent.tenant_id == tenant_id)
            .group_by(func.extract("hour", LedgerEvent.occurred_at))
            .order_by(func.extract("hour", LedgerEvent.occurred_at))
        )
    ).all()

    return {
        "total_events": total,
        "events_by_day": [{"date": r.day.date().isoformat(), "count": r.count} for r in day_rows],
        "events_by_category": [{"category": r.event_category, "count": r.count} for r in cat_rows],
        "events_by_severity": [{"severity": r.severity, "count": r.count} for r in sev_rows],
        "top_event_types": [{"event_type": r.event_type, "count": r.count} for r in type_rows],
        "outcome_breakdown": [{"outcome": r.outcome, "count": r.count} for r in outcome_rows],
        "activity_by_hour": [{"hour": int(r.hour), "count": r.count} for r in hour_rows],
    }


async def get_activity_heatmap(db: AsyncSession, *, tenant_id: UUID) -> list[dict]:
    rows = (
        await db.execute(
            select(
                func.extract("dow", LedgerEvent.occurred_at).label("dow"),
                func.extract("hour", LedgerEvent.occurred_at).label("hour"),
                func.count().label("count"),
            )
            .where(LedgerEvent.tenant_id == tenant_id)
            .group_by(
                func.extract("dow", LedgerEvent.occurred_at),
                func.extract("hour", LedgerEvent.occurred_at),
            )
        )
    ).all()
    return [{"day": int(r.dow), "hour": int(r.hour), "count": r.count} for r in rows]


async def get_chain_summary(db: AsyncSession) -> dict:
    row = (
        await db.execute(
            select(
                func.count().label("total"),
                func.min(LedgerEvent.sequence_num).label("first_seq"),
                func.max(LedgerEvent.sequence_num).label("last_seq"),
                func.min(LedgerEvent.occurred_at).label("first_at"),
                func.max(LedgerEvent.occurred_at).label("last_at"),
            )
        )
    ).one()
    return {
        "total_events": row.total,
        "first_sequence_num": row.first_seq,
        "last_sequence_num": row.last_seq,
        "first_event_at": row.first_at.isoformat() if row.first_at else None,
        "last_event_at": row.last_at.isoformat() if row.last_at else None,
    }


async def get_actor_risk_scores(db: AsyncSession, *, tenant_id: UUID, limit: int = 50) -> list[dict]:
    now = time_module.time()
    cached = _risk_score_cache.get(tenant_id)
    if cached is not None:
        expires_at, cached_scores = cached
        if expires_at > now:
            return cached_scores[:limit]

    scored = await _compute_actor_risk_scores(db, tenant_id=tenant_id)
    _risk_score_cache[tenant_id] = (now + _RISK_SCORE_CACHE_TTL_SECONDS, scored)
    return scored[:limit]
