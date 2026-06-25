from datetime import datetime, timezone

import pytest_asyncio
from fastapi.testclient import TestClient

from app.api.deps import get_db
from app.ledger.append import append_event
from app.main import app
from app.schemas.event import EventCreate
from app.schemas.source import SourceCreate
from app.services import stats_service
from app.services.source_service import create_source

from conftest import create_test_session_token, create_test_user


def _event(**overrides):
    base = dict(
        occurred_at=datetime.now(timezone.utc),
        actor_type="user",
        actor_id="alice",
        event_type="auth.login",
        event_category="authentication",
        outcome="success",
        severity="info",
    )
    base.update(overrides)
    return EventCreate(**base)


@pytest_asyncio.fixture
async def client(test_db):
    async def _override_get_db():
        async with test_db.session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db

    admin = await create_test_user(test_db, username="admin", password="admin-password-123", role="admin")
    token = await create_test_session_token(test_db, admin)

    async with test_db.session_factory() as db:
        source = await create_source(db, SourceCreate(name="stats-test-source", source_kind="manual"))
        # alice: 2 failed logins (5*2=10) + 5 critical events (10*5=50) -> 60, comfortably over the 50 high-risk threshold
        await append_event(db, _event(actor_id="alice", outcome="failure"), source_id=source.id)
        await append_event(db, _event(actor_id="alice", outcome="failure"), source_id=source.id)
        for _ in range(5):
            await append_event(db, _event(actor_id="alice", severity="critical"), source_id=source.id)
        # bob: one ordinary successful event -> should score low
        await append_event(db, _event(actor_id="bob"), source_id=source.id)
        await db.commit()

    with TestClient(app) as c:
        c.cookies.set("session_token", token)
        yield c

    app.dependency_overrides.clear()


def test_overview_stats(client):
    resp = client.get("/v1/stats/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["events_today"] >= 4
    assert data["critical_flags"] >= 1
    assert data["active_sources"] >= 1
    assert data["high_risk_users"] >= 1


def test_risk_actors_sorted_descending(client):
    resp = client.get("/v1/risk/actors")
    assert resp.status_code == 200
    scores = resp.json()
    by_actor = {s["actor_id"]: s for s in scores}

    assert by_actor["alice"]["risk_score"] > by_actor["bob"]["risk_score"]
    assert by_actor["alice"]["failed_count"] == 2
    assert by_actor["alice"]["critical_count"] == 5
    # list overall must be sorted descending by score
    assert scores == sorted(scores, key=lambda s: s["risk_score"], reverse=True)


def test_stats_require_auth(client):
    # client's cookie jar already carries an admin session; use a fresh,
    # cookie-less client to actually test the unauthenticated case.
    with TestClient(app) as anon:
        resp = anon.get("/v1/stats/overview")
    assert resp.status_code == 401
