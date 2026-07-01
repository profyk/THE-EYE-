"""Demo seed logic — shared by the admin API endpoint and the CLI script.

Uses EventCreate.model_construct() to skip the backdate validator so events
can be placed 30 days in the past without needing to override settings.
"""
import random
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ledger.append import append_event
from app.models.ingestion_source import IngestionSource
from app.schemas.event import EventCreate
from app.schemas.source import SourceCreate
from app.services.source_service import create_source

SEED_SOURCE_NAME = "yc-demo-seed"

HOSTS = [
    "prod-api-01.novapay.internal",
    "prod-api-02.novapay.internal",
    "prod-db-01.novapay.internal",
    "admin-portal.novapay.internal",
    "svc-billing-01.novapay.internal",
]
IPS = ["10.0.1.10", "10.0.1.11", "10.0.2.20", "10.0.3.30", "192.168.50.5", "192.168.50.6"]
MARCUS_IPS = ["185.220.101.45", "45.142.212.100"]

STAFF = [
    ("sarah.kim",     "user",            "Sarah Kim"),
    ("james.okonkwo", "user",            "James Okonkwo"),
    ("priya.sharma",  "user",            "Priya Sharma"),
    ("tom.lee",       "user",            "Tom Lee"),
    ("aisha.mensah",  "user",            "Aisha Mensah"),
    ("marcus.webb",   "user",            "Marcus Webb"),
    ("svc-billing",   "service_account", "Billing Service"),
    ("svc-etl",       "service_account", "ETL Pipeline"),
    ("svc-notify",    "service_account", "Notification Service"),
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _biz_ts(day_offset: float) -> datetime:
    base = _now() - timedelta(days=day_offset)
    return base.replace(
        hour=random.randint(8, 17),
        minute=random.randint(0, 59),
        second=random.randint(0, 59),
        microsecond=0,
    )


def _ev(
    occurred_at: datetime,
    actor_id: str,
    actor_type: str,
    actor_display_name: str | None,
    event_type: str,
    event_category: str,
    outcome: str,
    severity: str = "info",
    host: str | None = None,
    ip: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    change_summary: dict | None = None,
    metadata: dict | None = None,
) -> EventCreate:
    # model_construct skips validators — safe here since we control the data
    # and need to backdate events beyond the API's max_backdate_days limit.
    return EventCreate.model_construct(
        occurred_at=occurred_at,
        actor_type=actor_type,
        actor_id=actor_id,
        actor_display_name=actor_display_name,
        event_type=event_type,
        event_category=event_category,
        outcome=outcome,
        severity=severity,
        origin_host=host or random.choice(HOSTS),
        origin_ip=ip or random.choice(IPS),
        origin_application="NovaPay Platform",
        target_type=target_type,
        target_id=target_id,
        change_summary=change_summary,
        metadata=metadata or {"seeded": True, "demo": "yc"},
    )


def build_demo_events() -> list[EventCreate]:
    events: list[EventCreate] = []
    now = _now()

    normal_actors = [a for a in STAFF if a[0] != "marcus.webb"]

    # Daily auth traffic
    for day in range(30, 0, -1):
        weekday = (now - timedelta(days=day)).weekday()
        if weekday >= 5 and random.random() < 0.7:
            continue
        for actor_id, actor_type, display in normal_actors:
            if actor_type != "user":
                continue
            ts = _biz_ts(day)
            events.append(_ev(ts, actor_id, actor_type, display,
                               "auth.login", "authentication", "success"))
            events.append(_ev(ts + timedelta(hours=random.randint(4, 9)),
                               actor_id, actor_type, display,
                               "auth.logout", "authentication", "success"))

    # Occasional auth failures
    for _ in range(40):
        day = random.randint(2, 30)
        actor_id, actor_type, display = random.choice(
            [a for a in STAFF if a[1] == "user" and a[0] != "marcus.webb"])
        events.append(_ev(_biz_ts(day), actor_id, actor_type, display,
                          "auth.login", "authentication", "failure", "warning"))

    # Data access — normal
    data_actors = [a for a in STAFF if a[0] in ("sarah.kim", "james.okonkwo", "priya.sharma")]
    for day in range(30, 0, -1):
        for _ in range(random.randint(3, 12)):
            actor_id, actor_type, display = random.choice(data_actors)
            events.append(_ev(_biz_ts(day), actor_id, actor_type, display,
                               "data.read", "data_access", "success",
                               target_type="customer_record",
                               target_id=f"cust-{random.randint(10000,99999)}"))

    # Financial transactions
    for day in range(30, 0, -1):
        for _ in range(random.randint(20, 80)):
            ts = now - timedelta(days=day, hours=random.uniform(0, 23))
            sev = "warning" if random.random() < 0.04 else "info"
            events.append(_ev(ts, "svc-billing", "service_account", "Billing Service",
                               "txn.create", "financial_transaction",
                               "success" if random.random() > 0.03 else "failure", sev,
                               host="svc-billing-01.novapay.internal", ip="10.0.2.20",
                               target_type="transaction",
                               target_id=f"txn-{random.randint(100000,999999)}"))

    # ETL pipeline
    for day in range(30, 0, -1):
        for _ in range(random.randint(2, 6)):
            ts = now - timedelta(days=day, hours=random.uniform(0, 5))
            events.append(_ev(ts, "svc-etl", "service_account", "ETL Pipeline",
                               "data.export", "data_access", "success",
                               host="prod-db-01.novapay.internal", ip="10.0.3.30",
                               target_type="dataset", target_id=f"ds-{random.randint(1,20)}"))

    # Admin housekeeping
    admin_events = [
        ("config.update", "configuration", "success", "warning"),
        ("user.deactivate", "administrative", "success", "info"),
        ("role.grant", "authorization", "success", "warning"),
        ("role.revoke", "authorization", "denied", "warning"),
    ]
    for _ in range(25):
        day = random.randint(1, 30)
        actor_id, actor_type, display = random.choice(
            [a for a in STAFF if a[0] in ("sarah.kim", "tom.lee")])
        etype, ecat, outcome, sev = random.choice(admin_events)
        events.append(_ev(_biz_ts(day), actor_id, actor_type, display, etype, ecat, outcome, sev))

    # Process execution
    for day in range(30, 0, -1):
        for _ in range(random.randint(1, 4)):
            events.append(_ev(_biz_ts(day), "svc-etl", "service_account", "ETL Pipeline",
                               "process.exec", "process_execution", "success", "debug",
                               host="prod-api-01.novapay.internal"))

    # ── Incident: marcus.webb (day 5) ─────────────────────────────────────────
    brute_start = now - timedelta(days=5, hours=10)

    for i in range(47):
        ts = brute_start + timedelta(minutes=i * 2)
        events.append(_ev(ts, "marcus.webb", "user", "Marcus Webb",
                          "auth.login", "authentication", "failure",
                          "warning" if i < 20 else "high",
                          host="admin-portal.novapay.internal",
                          ip=random.choice(MARCUS_IPS),
                          metadata={"seeded": True, "attempt": i + 1, "demo": "yc"}))

    events.append(_ev(brute_start + timedelta(minutes=95),
                      "marcus.webb", "user", "Marcus Webb",
                      "auth.login", "authentication", "success", "critical",
                      host="admin-portal.novapay.internal", ip=MARCUS_IPS[0]))

    mass_start = brute_start + timedelta(minutes=100)
    for i in range(120):
        ts = mass_start + timedelta(seconds=i * 15)
        events.append(_ev(ts, "marcus.webb", "user", "Marcus Webb",
                          "data.read", "data_access", "success", "high",
                          host="prod-db-01.novapay.internal", ip=MARCUS_IPS[0],
                          target_type="customer_record",
                          target_id=f"cust-{random.randint(10000,99999)}",
                          metadata={"seeded": True, "bulk_access": True, "demo": "yc"}))

    events.append(_ev(mass_start + timedelta(minutes=35),
                      "marcus.webb", "user", "Marcus Webb",
                      "role.grant", "authorization", "denied", "critical",
                      host="admin-portal.novapay.internal", ip=MARCUS_IPS[0],
                      target_type="role", target_id="super_admin",
                      change_summary={"requested_role": "super_admin", "denied_reason": "insufficient_permissions"}))

    for i in range(8):
        ts = mass_start + timedelta(minutes=40 + i * 3)
        events.append(_ev(ts, "marcus.webb", "user", "Marcus Webb",
                          "txn.create", "financial_transaction", "success", "critical",
                          host="prod-api-01.novapay.internal", ip=MARCUS_IPS[1],
                          target_type="transaction",
                          target_id=f"txn-{random.randint(100000,999999)}",
                          metadata={"seeded": True, "amount_usd": random.randint(50000, 200000), "demo": "yc"}))

    events.append(_ev(mass_start + timedelta(minutes=66),
                      "marcus.webb", "user", "Marcus Webb",
                      "config.update", "configuration", "denied", "critical",
                      host="admin-portal.novapay.internal", ip=MARCUS_IPS[0],
                      change_summary={"attempted_field": "audit_log_retention", "attempted_value": "0"}))

    events.append(_ev(brute_start + timedelta(hours=2, minutes=10),
                      "sarah.kim", "user", "Sarah Kim",
                      "user.deactivate", "administrative", "success", "warning",
                      host="admin-portal.novapay.internal", ip="10.0.1.10",
                      target_type="user", target_id="marcus.webb"))

    for day_back in [4, 3, 2, 1]:
        for reviewer in [("sarah.kim", "Sarah Kim"), ("tom.lee", "Tom Lee")]:
            events.append(_ev(_biz_ts(day_back), reviewer[0], "user", reviewer[1],
                               "data.read", "data_access", "success",
                               host="admin-portal.novapay.internal",
                               target_type="audit_report",
                               target_id="incident-2026-marcus-webb"))

    return events


async def _get_or_create_source(db: AsyncSession, tenant_id: UUID) -> IngestionSource:
    existing = (
        await db.execute(
            select(IngestionSource).where(
                IngestionSource.name == SEED_SOURCE_NAME,
                IngestionSource.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return existing
    created = await create_source(
        db, SourceCreate(name=SEED_SOURCE_NAME, source_kind="agent"), tenant_id=tenant_id
    )
    return (
        await db.execute(select(IngestionSource).where(IngestionSource.id == created.id))
    ).scalar_one()


async def run_demo_seed(db: AsyncSession, *, tenant_id: UUID) -> dict:
    events = build_demo_events()
    random.shuffle(events)

    source = await _get_or_create_source(db, tenant_id)

    ok = 0
    fail = 0
    for ev in events:
        try:
            await append_event(db, ev, source_id=source.id, tenant_id=tenant_id)
            ok += 1
        except Exception:
            fail += 1

    await db.commit()
    return {"inserted": ok, "skipped": fail, "source_id": str(source.id)}
