"""Real threshold-rule alerting, evaluated on-demand against the live ledger --
no background scheduler, no separate duplicate log of "alert events". Each
rule defines its own lookback window and threshold; matching conditions are
recomputed fresh every time /v1/alerts is called.

Alert identity (alert_key) is deterministic: rule_id + actor_id + the window
bucket the condition was detected in, so re-evaluating within the same window
always yields the same key -- that's what lets acknowledgment persist
correctly instead of spawning a new "alert" every poll.
"""
import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert_acknowledgment import AlertAcknowledgment
from app.models.ledger_event import LedgerEvent

FAILED_LOGIN_WINDOW_MINUTES = 15
FAILED_LOGIN_THRESHOLD = 5

BULK_EXPORT_WINDOW_MINUTES = 10
BULK_EXPORT_THRESHOLD = 10

CRITICAL_FINANCIAL_LOOKBACK_HOURS = 24


@dataclass
class AlertInstance:
    key: str
    rule_id: str
    rule_name: str
    severity: str
    actor_id: str
    message: str
    detected_at: datetime
    status: str = "open"
    acknowledged_by: str | None = None
    acknowledged_at: datetime | None = None


def _bucket_start(now: datetime, window_minutes: int) -> datetime:
    """Floors `now` to the start of its window-sized bucket, so repeated
    evaluations within the same window produce the same bucket (and therefore
    the same alert_key) instead of a new alert every poll."""
    epoch_minutes = int(now.timestamp() // 60)
    bucket_minutes = (epoch_minutes // window_minutes) * window_minutes
    return datetime.fromtimestamp(bucket_minutes * 60, tz=timezone.utc)


def _make_key(rule_id: str, tenant_id: UUID, actor_id: str, bucket: datetime) -> str:
    # tenant_id is part of the hashed input, not just a separate column on
    # AlertAcknowledgment, so two tenants with a same-named actor can never
    # collide on the same key in the first place.
    raw = f"{rule_id}:{tenant_id}:{actor_id}:{bucket.isoformat()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _failed_login_alerts(db: AsyncSession, now: datetime, *, tenant_id: UUID) -> list[AlertInstance]:
    window_start = now - timedelta(minutes=FAILED_LOGIN_WINDOW_MINUTES)
    bucket = _bucket_start(now, FAILED_LOGIN_WINDOW_MINUTES)

    stmt = (
        select(LedgerEvent.actor_id, func.count().label("failed_count"))
        .where(
            LedgerEvent.outcome == "failure",
            LedgerEvent.occurred_at >= window_start,
            LedgerEvent.tenant_id == tenant_id,
        )
        .group_by(LedgerEvent.actor_id)
        .having(func.count() >= FAILED_LOGIN_THRESHOLD)
    )
    rows = (await db.execute(stmt)).all()

    return [
        AlertInstance(
            key=_make_key("failed_logins", tenant_id, row.actor_id, bucket),
            rule_id="failed_logins",
            rule_name="Repeated failed logins",
            severity="high",
            actor_id=row.actor_id,
            message=f"{row.failed_count} failed login attempts by '{row.actor_id}' in the last "
            f"{FAILED_LOGIN_WINDOW_MINUTES} minutes",
            detected_at=now,
        )
        for row in rows
    ]


async def _bulk_export_alerts(db: AsyncSession, now: datetime, *, tenant_id: UUID) -> list[AlertInstance]:
    window_start = now - timedelta(minutes=BULK_EXPORT_WINDOW_MINUTES)
    bucket = _bucket_start(now, BULK_EXPORT_WINDOW_MINUTES)

    stmt = (
        select(LedgerEvent.actor_id, func.count().label("access_count"))
        .where(
            LedgerEvent.event_category == "data_access",
            LedgerEvent.occurred_at >= window_start,
            LedgerEvent.tenant_id == tenant_id,
        )
        .group_by(LedgerEvent.actor_id)
        .having(func.count() >= BULK_EXPORT_THRESHOLD)
    )
    rows = (await db.execute(stmt)).all()

    return [
        AlertInstance(
            key=_make_key("bulk_data_export", tenant_id, row.actor_id, bucket),
            rule_id="bulk_data_export",
            rule_name="Bulk data export detected",
            severity="critical",
            actor_id=row.actor_id,
            message=f"{row.access_count} data access events by '{row.actor_id}' in the last "
            f"{BULK_EXPORT_WINDOW_MINUTES} minutes",
            detected_at=now,
        )
        for row in rows
    ]


async def _critical_financial_alerts(db: AsyncSession, now: datetime, *, tenant_id: UUID) -> list[AlertInstance]:
    lookback = now - timedelta(hours=CRITICAL_FINANCIAL_LOOKBACK_HOURS)

    stmt = select(LedgerEvent).where(
        LedgerEvent.event_category == "financial_transaction",
        LedgerEvent.severity.in_(["high", "critical"]),
        LedgerEvent.occurred_at >= lookback,
        LedgerEvent.tenant_id == tenant_id,
    )
    rows = (await db.execute(stmt)).scalars().all()

    return [
        AlertInstance(
            key=hashlib.sha256(f"critical_financial:{row.id}".encode("utf-8")).hexdigest(),
            rule_id="critical_financial",
            rule_name="High-severity financial transaction",
            severity=row.severity,
            actor_id=row.actor_id,
            message=f"'{row.actor_id}' performed a {row.severity}-severity financial transaction "
            f"({row.event_type}) at {row.occurred_at.isoformat()}",
            detected_at=row.occurred_at,
        )
        for row in rows
    ]


async def evaluate_alerts(db: AsyncSession, *, tenant_id: UUID) -> list[AlertInstance]:
    now = datetime.now(timezone.utc)
    alerts = (
        await _failed_login_alerts(db, now, tenant_id=tenant_id)
        + await _bulk_export_alerts(db, now, tenant_id=tenant_id)
        + await _critical_financial_alerts(db, now, tenant_id=tenant_id)
    )

    if not alerts:
        return []

    keys = [a.key for a in alerts]
    acks = (
        await db.execute(
            select(AlertAcknowledgment).where(
                AlertAcknowledgment.alert_key.in_(keys), AlertAcknowledgment.tenant_id == tenant_id
            )
        )
    ).scalars().all()
    acks_by_key = {a.alert_key: a for a in acks}

    for alert in alerts:
        ack = acks_by_key.get(alert.key)
        if ack:
            alert.status = ack.status
            alert.acknowledged_by = str(ack.acknowledged_by)
            alert.acknowledged_at = ack.acknowledged_at

    alerts.sort(key=lambda a: a.detected_at, reverse=True)
    return alerts


async def acknowledge_alert(
    db: AsyncSession, *, alert_key: str, rule_id: str, actor_id: str, status: str, user_id, tenant_id: UUID
) -> None:
    existing = (
        await db.execute(
            select(AlertAcknowledgment).where(
                AlertAcknowledgment.alert_key == alert_key, AlertAcknowledgment.tenant_id == tenant_id
            )
        )
    ).scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if existing:
        existing.status = status
        existing.acknowledged_by = user_id
        existing.acknowledged_at = now
    else:
        db.add(
            AlertAcknowledgment(
                tenant_id=tenant_id,
                alert_key=alert_key,
                rule_id=rule_id,
                actor_id=actor_id,
                status=status,
                acknowledged_by=user_id,
                acknowledged_at=now,
            )
        )
    await db.commit()
