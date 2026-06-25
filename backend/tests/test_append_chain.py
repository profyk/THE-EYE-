from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from app.ledger.append import append_batch, append_event
from app.ledger.verify import verify_chain
from app.schemas.event import EventCreate
from app.schemas.source import SourceCreate
from app.services.source_service import create_source


def _event(actor_id="alice", **overrides):
    base = dict(
        occurred_at=datetime.now(timezone.utc),
        actor_type="user",
        actor_id=actor_id,
        event_type="auth.login",
        event_category="authentication",
        outcome="success",
    )
    base.update(overrides)
    return EventCreate(**base)


@pytest.mark.asyncio
async def test_append_then_verify_chain_intact(test_db):
    async with test_db.session_factory() as db:
        source = await create_source(db, SourceCreate(name="test-source", source_kind="manual"))

        for i in range(20):
            await append_event(db, _event(actor_id=f"actor-{i}"), source_id=source.id)
        await db.commit()

        report = await verify_chain(db)
        assert report.ok
        assert report.records_checked == 20


@pytest.mark.asyncio
async def test_append_batch_links_sequentially(test_db):
    async with test_db.session_factory() as db:
        source = await create_source(db, SourceCreate(name="test-source", source_kind="manual"))

        rows = await append_batch(db, [_event(), _event(), _event()], source_id=source.id)
        await db.commit()

        assert [r.sequence_num for r in rows] == [1, 2, 3]
        assert rows[1].prev_hash == rows[0].record_hash
        assert rows[2].prev_hash == rows[1].record_hash


@pytest.mark.asyncio
async def test_verify_chain_detects_tampering(test_db):
    async with test_db.session_factory() as db:
        source = await create_source(db, SourceCreate(name="test-source", source_kind="manual"))
        await append_batch(db, [_event(), _event(), _event()], source_id=source.id)
        await db.commit()

    # Tamper via the admin (superuser-equivalent) connection with triggers
    # disabled for the session -- this models a worst-case insider with raw DB
    # access bypassing even the BEFORE UPDATE trigger, to prove verify_chain()
    # independently catches content tampering that somehow lands in storage.
    async with test_db.admin_engine.connect() as conn:
        await conn.execute(text("SET session_replication_role = replica"))
        await conn.execute(text("UPDATE ledger.events SET outcome = 'denied' WHERE sequence_num = 2"))
        await conn.commit()

    async with test_db.session_factory() as db:
        report = await verify_chain(db)
        assert not report.ok
        assert any(d.sequence_num == 2 for d in report.divergences)


@pytest.mark.asyncio
async def test_eye_app_role_cannot_update_or_delete_events(test_db):
    async with test_db.session_factory() as db:
        source = await create_source(db, SourceCreate(name="test-source", source_kind="manual"))
        row = await append_event(db, _event(), source_id=source.id)
        await db.commit()
        event_id = row.id

    async with test_db.session_factory() as db:
        with pytest.raises(Exception):
            await db.execute(
                text("UPDATE ledger.events SET outcome = 'denied' WHERE id = :id"), {"id": str(event_id)}
            )
            await db.commit()
        await db.rollback()

    async with test_db.session_factory() as db:
        with pytest.raises(Exception):
            await db.execute(text("DELETE FROM ledger.events WHERE id = :id"), {"id": str(event_id)})
            await db.commit()
