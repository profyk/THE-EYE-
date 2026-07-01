"""YC demo seed — generates ~2 500 realistic audit events spread across the
last 30 days so every analytics panel looks populated and interesting.

Scenario: "NovaPay" — a fintech company using THE EYE to monitor its
internal systems. The data includes a realistic incident arc:

  Week 1–3  Normal operations, occasional auth failures, data access
  Week 4    A suspicious actor (marcus.webb) triggers a spike:
              – 47 failed logins then a successful brute-force login
              – mass data_access events (customer records)
              – privilege escalation attempt (denied)
              – critical financial_transaction events
  Ongoing   Admin housekeeping, service accounts, config changes

Run from the backend/ directory:
    python -m scripts.seed_yc [--tenant-id <uuid>]
"""
import argparse
import asyncio
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import settings
from app.db.session import SessionLocal
from app.ledger.append import append_event
from app.models.ingestion_source import IngestionSource
from app.schemas.event import EventCreate
from app.schemas.source import SourceCreate
from app.services.source_service import create_source

# bypass the 7-day backdate guard for seeding
settings.max_backdate_days = 35

NOW = datetime.now(timezone.utc)
SEED_SOURCE_NAME = "yc-demo-seed"

# ── Actors ────────────────────────────────────────────────────────────────────
STAFF = [
    ("sarah.kim",      "user",            "Sarah Kim"),
    ("james.okonkwo",  "user",            "James Okonkwo"),
    ("priya.sharma",   "user",            "Priya Sharma"),
    ("tom.lee",        "user",            "Tom Lee"),
    ("aisha.mensah",   "user",            "Aisha Mensah"),
    ("marcus.webb",    "user",            "Marcus Webb"),      # the bad actor
    ("svc-billing",    "service_account", "Billing Service"),
    ("svc-etl",        "service_account", "ETL Pipeline"),
    ("svc-notify",     "service_account", "Notification Service"),
]

HOSTS = [
    "prod-api-01.novapay.internal",
    "prod-api-02.novapay.internal",
    "prod-db-01.novapay.internal",
    "admin-portal.novapay.internal",
    "svc-billing-01.novapay.internal",
]

IPS = [
    "10.0.1.10", "10.0.1.11", "10.0.2.20", "10.0.3.30",
    "192.168.50.5", "192.168.50.6",
]

MARCUS_IPS = ["185.220.101.45", "45.142.212.100"]  # suspicious external IPs


def ago(days: float = 0, hours: float = 0, minutes: float = 0) -> datetime:
    return NOW - timedelta(days=days, hours=hours, minutes=minutes)


def jitter(base: datetime, minutes: int = 30) -> datetime:
    offset = random.randint(-minutes * 60, minutes * 60)
    return base + timedelta(seconds=offset)


def biz_hour_ts(day_offset: float) -> datetime:
    """Random timestamp during business hours (8-18 UTC) on the given day."""
    base = NOW - timedelta(days=day_offset)
    base = base.replace(hour=random.randint(8, 17), minute=random.randint(0, 59),
                        second=random.randint(0, 59), microsecond=0)
    return base


def make(
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
    return EventCreate(
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


def build_events() -> list[EventCreate]:
    events: list[EventCreate] = []

    # ── Normal daily auth traffic ────────────────────────────────────────────
    normal_actors = [a for a in STAFF if a[0] not in ("marcus.webb",)]
    for day in range(30, 0, -1):
        # each staff member logs in once per business day (skip weekends ~30%)
        weekday = (NOW - timedelta(days=day)).weekday()
        if weekday >= 5 and random.random() < 0.7:
            continue
        for actor_id, actor_type, display in normal_actors:
            if actor_type != "user":
                continue
            ts = biz_hour_ts(day)
            events.append(make(ts, actor_id, actor_type, display,
                               "auth.login", "authentication", "success", "info"))
            # random logout later that day
            events.append(make(ts + timedelta(hours=random.randint(4, 9)),
                               actor_id, actor_type, display,
                               "auth.logout", "authentication", "success", "info"))

    # ── Occasional auth failures (wrong password) ───────────────────────────
    for _ in range(40):
        day = random.randint(2, 30)
        actor_id, actor_type, display = random.choice(
            [a for a in STAFF if a[1] == "user" and a[0] != "marcus.webb"])
        events.append(make(biz_hour_ts(day), actor_id, actor_type, display,
                           "auth.login", "authentication", "failure", "warning"))

    # ── Data access – normal reads ───────────────────────────────────────────
    data_actors = [a for a in STAFF if a[0] in ("sarah.kim", "james.okonkwo", "priya.sharma")]
    for day in range(30, 0, -1):
        n = random.randint(3, 12)
        for _ in range(n):
            actor_id, actor_type, display = random.choice(data_actors)
            events.append(make(biz_hour_ts(day), actor_id, actor_type, display,
                               "data.read", "data_access", "success", "info",
                               target_type="customer_record",
                               target_id=f"cust-{random.randint(10000, 99999)}"))

    # ── Financial transactions – service account ─────────────────────────────
    for day in range(30, 0, -1):
        n = random.randint(20, 80)
        for _ in range(n):
            ts = ago(days=day, hours=random.uniform(0, 23))
            sev = "warning" if random.random() < 0.04 else "info"
            events.append(make(ts, "svc-billing", "service_account", "Billing Service",
                               "txn.create", "financial_transaction",
                               "success" if random.random() > 0.03 else "failure",
                               sev,
                               host="svc-billing-01.novapay.internal",
                               ip="10.0.2.20",
                               target_type="transaction",
                               target_id=f"txn-{random.randint(100000, 999999)}"))

    # ── ETL pipeline events ──────────────────────────────────────────────────
    for day in range(30, 0, -1):
        for _ in range(random.randint(2, 6)):
            ts = ago(days=day, hours=random.uniform(0, 5))  # runs at night
            events.append(make(ts, "svc-etl", "service_account", "ETL Pipeline",
                               "data.export", "data_access", "success", "info",
                               host="prod-db-01.novapay.internal",
                               ip="10.0.3.30",
                               target_type="dataset",
                               target_id=f"ds-{random.randint(1, 20)}"))

    # ── Config + admin housekeeping ──────────────────────────────────────────
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
        events.append(make(biz_hour_ts(day), actor_id, actor_type, display,
                           etype, ecat, outcome, sev))

    # ── Process execution (monitoring agent) ────────────────────────────────
    for day in range(30, 0, -1):
        for _ in range(random.randint(1, 4)):
            events.append(make(biz_hour_ts(day),
                               "svc-etl", "service_account", "ETL Pipeline",
                               "process.exec", "process_execution", "success", "debug",
                               host="prod-api-01.novapay.internal"))

    # ── INCIDENT ARC: marcus.webb (days 5–0) ────────────────────────────────
    # Phase 1: brute-force login attempts (day 5, business hours)
    brute_start = ago(days=5, hours=10)
    for i in range(47):
        ts = brute_start + timedelta(minutes=i * 2)
        events.append(make(ts, "marcus.webb", "user", "Marcus Webb",
                           "auth.login", "authentication", "failure",
                           "warning" if i < 20 else "high",
                           host="admin-portal.novapay.internal",
                           ip=random.choice(MARCUS_IPS),
                           metadata={"seeded": True, "attempt": i + 1, "demo": "yc"}))

    # Phase 2: successful login (brute-force succeeded, day 5)
    events.append(make(brute_start + timedelta(minutes=95),
                       "marcus.webb", "user", "Marcus Webb",
                       "auth.login", "authentication", "success", "critical",
                       host="admin-portal.novapay.internal",
                       ip=MARCUS_IPS[0]))

    # Phase 3: mass data access — 120 customer record reads in 30 min
    mass_start = brute_start + timedelta(minutes=100)
    for i in range(120):
        ts = mass_start + timedelta(seconds=i * 15)
        events.append(make(ts, "marcus.webb", "user", "Marcus Webb",
                           "data.read", "data_access",
                           "success", "high",
                           host="prod-db-01.novapay.internal",
                           ip=MARCUS_IPS[0],
                           target_type="customer_record",
                           target_id=f"cust-{random.randint(10000, 99999)}",
                           metadata={"seeded": True, "bulk_access": True, "demo": "yc"}))

    # Phase 4: privilege escalation attempt (denied)
    events.append(make(mass_start + timedelta(minutes=35),
                       "marcus.webb", "user", "Marcus Webb",
                       "role.grant", "authorization", "denied", "critical",
                       host="admin-portal.novapay.internal",
                       ip=MARCUS_IPS[0],
                       target_type="role",
                       target_id="super_admin",
                       change_summary={"requested_role": "super_admin", "denied_reason": "insufficient_permissions"}))

    # Phase 5: suspicious financial transactions
    for i in range(8):
        ts = mass_start + timedelta(minutes=40 + i * 3)
        events.append(make(ts, "marcus.webb", "user", "Marcus Webb",
                           "txn.create", "financial_transaction",
                           "success", "critical",
                           host="prod-api-01.novapay.internal",
                           ip=MARCUS_IPS[1],
                           target_type="transaction",
                           target_id=f"txn-{random.randint(100000, 999999)}",
                           metadata={"seeded": True, "amount_usd": random.randint(50000, 200000), "demo": "yc"}))

    # Phase 6: account config tamper attempt
    events.append(make(mass_start + timedelta(minutes=66),
                       "marcus.webb", "user", "Marcus Webb",
                       "config.update", "configuration", "denied", "critical",
                       host="admin-portal.novapay.internal",
                       ip=MARCUS_IPS[0],
                       change_summary={"attempted_field": "audit_log_retention", "attempted_value": "0"}))

    # Phase 7: session terminated by admin (day 5, +2h)
    events.append(make(brute_start + timedelta(hours=2, minutes=10),
                       "sarah.kim", "user", "Sarah Kim",
                       "user.deactivate", "administrative", "success", "warning",
                       host="admin-portal.novapay.internal",
                       ip="10.0.1.10",
                       target_type="user",
                       target_id="marcus.webb"))

    # Phase 8: post-incident review events (days 4–1)
    for day_back in [4, 3, 2, 1]:
        for reviewer in [("sarah.kim", "Sarah Kim"), ("tom.lee", "Tom Lee")]:
            events.append(make(biz_hour_ts(day_back),
                               reviewer[0], "user", reviewer[1],
                               "data.read", "data_access", "success", "info",
                               host="admin-portal.novapay.internal",
                               target_type="audit_report",
                               target_id="incident-2026-marcus-webb"))

    return events


async def get_or_create_source(db, tenant_id) -> IngestionSource:
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
        db,
        SourceCreate(name=SEED_SOURCE_NAME, source_kind="agent"),
        tenant_id=tenant_id,
    )
    return (await db.execute(select(IngestionSource).where(IngestionSource.id == created.id))).scalar_one()


async def main(tenant_id_override: str | None) -> None:
    from uuid import UUID
    from app.models.ledger_event import DEFAULT_TENANT_ID

    target_tenant = UUID(tenant_id_override) if tenant_id_override else DEFAULT_TENANT_ID

    events = build_events()
    random.shuffle(events)

    async with SessionLocal() as db:
        source = await get_or_create_source(db, target_tenant)

        ok = 0
        fail = 0
        for ev in events:
            try:
                await append_event(db, ev, source_id=source.id, tenant_id=target_tenant)
                ok += 1
            except Exception as exc:
                fail += 1
                if fail <= 5:
                    print(f"  skipped: {exc}")

        await db.commit()

    print(f"\nYC seed complete — {ok} events inserted, {fail} skipped")
    print(f"  Tenant: {target_tenant}")
    print(f"  Source: {source.name} ({source.id})")
    print("\nHighlights:")
    print("  • 30-day event history across 6 staff + 3 service accounts")
    print("  • Realistic financial transaction volume")
    print("  • marcus.webb incident arc: brute-force → mass data access → privilege escalation → terminated")
    print("  • Business-hours activity patterns")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed YC demo data into THE EYE")
    parser.add_argument("--tenant-id", default=None, help="UUID of tenant to seed (defaults to dev tenant)")
    args = parser.parse_args()
    asyncio.run(main(args.tenant_id))
