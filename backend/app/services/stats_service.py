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
from datetime import datetime, time, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion_source import IngestionSource
from app.models.ledger_event import LedgerEvent

_RISK_SCORE_CACHE_TTL_SECONDS = 20
_risk_score_cache: tuple[float, list[dict]] | None = None

# Heuristic, transparent risk score -- not a trained model. Documented here so
# the weighting is visible and easy to tune; a real statistical baselining
# model is the Phase 3 upgrade path noted in the original roadmap.
WEIGHT_FAILED_OUTCOME = 5
WEIGHT_CRITICAL_SEVERITY = 10
WEIGHT_ADMINISTRATIVE = 3
WEIGHT_FINANCIAL = 2
MAX_RISK_SCORE = 100


async def get_overview_stats(db: AsyncSession) -> dict:
    start_of_today = datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)

    events_today = (
        await db.execute(select(func.count()).select_from(LedgerEvent).where(LedgerEvent.occurred_at >= start_of_today))
    ).scalar_one()

    critical_flags = (
        await db.execute(
            select(func.count()).select_from(LedgerEvent).where(LedgerEvent.severity.in_(["high", "critical"]))
        )
    ).scalar_one()

    active_sources = (
        await db.execute(
            select(func.count()).select_from(IngestionSource).where(IngestionSource.is_active.is_(True))
        )
    ).scalar_one()

    risk_scores = await get_actor_risk_scores(db, limit=1000)
    high_risk_users = sum(1 for r in risk_scores if r["risk_score"] >= 50)

    return {
        "events_today": events_today,
        "critical_flags": critical_flags,
        "active_sources": active_sources,
        "high_risk_users": high_risk_users,
    }


async def _compute_actor_risk_scores(db: AsyncSession) -> list[dict]:
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


async def get_actor_risk_scores(db: AsyncSession, limit: int = 50) -> list[dict]:
    global _risk_score_cache

    now = time_module.time()
    if _risk_score_cache is not None:
        expires_at, cached_scores = _risk_score_cache
        if expires_at > now:
            return cached_scores[:limit]

    scored = await _compute_actor_risk_scores(db)
    _risk_score_cache = (now + _RISK_SCORE_CACHE_TTL_SECONDS, scored)
    return scored[:limit]
