"""CLI: insert sample events for local testing, via the real service layer
(append_event), not raw SQL -- so seeded data exercises the same code path
verify_chain.py and the API depend on.

Usage:
    python -m scripts.seed_dev_events --count 200
"""
import argparse
import asyncio
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db.session import SessionLocal
from app.ledger.append import append_event
from app.models.ingestion_source import IngestionSource
from app.schemas.event import EventCreate
from app.schemas.source import SourceCreate
from app.services.source_service import create_source

DEV_SOURCE_NAME = "dev-seed-source"

SAMPLE_EVENTS = [
    ("auth.login", "authentication", "success"),
    ("auth.login", "authentication", "failure"),
    ("auth.logout", "authentication", "success"),
    ("file.read", "data_access", "success"),
    ("file.delete", "data_modification", "success"),
    ("role.grant", "authorization", "success"),
    ("role.revoke", "authorization", "denied"),
    ("config.update", "configuration", "success"),
    ("process.exec", "process_execution", "success"),
    ("txn.create", "financial_transaction", "success"),
    ("user.deactivate", "administrative", "success"),
]
ACTORS = ["alice", "bob", "carol", "svc-billing", "svc-etl"]


async def get_or_create_dev_source(db) -> IngestionSource:
    existing = (
        await db.execute(select(IngestionSource).where(IngestionSource.name == DEV_SOURCE_NAME))
    ).scalar_one_or_none()
    if existing:
        return existing
    created = await create_source(db, SourceCreate(name=DEV_SOURCE_NAME, source_kind="manual"))
    return (await db.execute(select(IngestionSource).where(IngestionSource.id == created.id))).scalar_one()


async def main(count: int) -> None:
    async with SessionLocal() as db:
        source = await get_or_create_dev_source(db)

        for _ in range(count):
            event_type, category, outcome = random.choice(SAMPLE_EVENTS)
            actor_id = random.choice(ACTORS)
            event = EventCreate(
                occurred_at=datetime.now(timezone.utc) - timedelta(minutes=random.randint(0, 600)),
                actor_type="service_account" if actor_id.startswith("svc") else "user",
                actor_id=actor_id,
                event_type=event_type,
                event_category=category,
                outcome=outcome,
                target_type="account",
                target_id=f"acct-{random.randint(1000, 9999)}",
                metadata={"seeded": True},
            )
            await append_event(db, event, source_id=source.id)

        await db.commit()

    print(f"Seeded {count} events from source {source.name} ({source.id})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=200)
    args = parser.parse_args()
    asyncio.run(main(args.count))
