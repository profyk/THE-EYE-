"""Real intrusion detection -- not the prototype's fabricated random-attack
simulator. Built against signals we actually have: failed authentication
attempts against this platform itself (rejected ingestion API keys, failed
dashboard logins), each with a real client IP and real GeoIP lookup. No
external network/IDS data source exists yet, so this only ever reflects
attempts against THE EYE itself, not third-party network traffic -- that's an
honest, documented limitation, not a gap to hide.
"""
import asyncio
from collections import Counter
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ledger.append import append_event
from app.models.ledger_event import LedgerEvent
from app.schemas.event import EventCreate
from app.services.geoip_service import lookup_geoip
from app.services.source_service import get_source_by_name

PLATFORM_SOURCE_NAME = "the-eye-platform"
RECENT_ATTEMPTS_LIMIT = 200


async def log_failed_ingestion_attempt(db: AsyncSession, *, client_ip: str | None, reason: str) -> None:
    """Called from app/api/deps.py's get_current_source on every rejected
    ingestion API key -- previously this just 401'd with nothing recorded."""
    source = await get_source_by_name(db, PLATFORM_SOURCE_NAME)
    if source is None:
        return

    geo = await asyncio.to_thread(lookup_geoip, client_ip) if client_ip else None

    event = EventCreate(
        occurred_at=datetime.now(timezone.utc),
        actor_type="unknown",
        actor_id="unknown",
        event_type="intrusion.ingestion_key_rejected",
        event_category="authentication",
        outcome="failure",
        origin_ip=client_ip,
        metadata={"reason": reason, **({"geo": geo} if geo else {})},
    )
    await append_event(db, event, source_id=source.id)
    await db.commit()


async def get_intrusion_stats(db: AsyncSession) -> dict:
    stmt = (
        select(LedgerEvent)
        .where(
            LedgerEvent.outcome == "failure",
            LedgerEvent.event_category == "authentication",
            LedgerEvent.origin_ip.is_not(None),
        )
        .order_by(LedgerEvent.occurred_at.desc())
        .limit(RECENT_ATTEMPTS_LIMIT)
    )
    rows = (await db.execute(stmt)).scalars().all()

    country_counts: Counter[str] = Counter()
    attempts = []
    for row in rows:
        geo = (row.metadata_ or {}).get("geo") or {}
        country = geo.get("country") or "Unknown"
        country_counts[country] += 1
        attempts.append(
            {
                "ip": str(row.origin_ip) if row.origin_ip else None,
                "country": country,
                "city": geo.get("city"),
                "latitude": geo.get("latitude"),
                "longitude": geo.get("longitude"),
                "event_type": row.event_type,
                "occurred_at": row.occurred_at,
            }
        )

    return {
        "total_attempts": len(rows),
        "countries": [{"country": c, "count": n} for c, n in country_counts.most_common()],
        "attempts": attempts,
    }
