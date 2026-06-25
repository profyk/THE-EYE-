from datetime import datetime, timezone

import pytest_asyncio
from fastapi.testclient import TestClient

from app.api.deps import get_db
from app.ledger.append import append_event
from app.main import app
from app.schemas.event import EventCreate
from app.schemas.source import SourceCreate
from app.services.source_service import create_source

from conftest import create_test_session_token, create_test_user


def _event(**overrides):
    base = dict(
        occurred_at=datetime.now(timezone.utc),
        actor_type="user",
        actor_id="mallory",
        event_type="auth.login",
        event_category="authentication",
        outcome="failure",
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
        source = await create_source(db, SourceCreate(name="alert-test-source", source_kind="manual"))
        for _ in range(5):
            await append_event(db, _event(), source_id=source.id)
        await db.commit()

    with TestClient(app) as c:
        c.cookies.set("session_token", token)
        yield c

    app.dependency_overrides.clear()


def test_failed_login_alert_triggers(client):
    resp = client.get("/v1/alerts")
    assert resp.status_code == 200
    alerts = resp.json()
    matching = [a for a in alerts if a["rule_id"] == "failed_logins" and a["actor_id"] == "mallory"]
    assert len(matching) == 1
    assert matching[0]["status"] == "open"
    assert matching[0]["acknowledged_by"] is None


def test_acknowledge_alert_persists_and_logs_event(client):
    alerts = client.get("/v1/alerts").json()
    alert = next(a for a in alerts if a["rule_id"] == "failed_logins")

    resp = client.post(
        f"/v1/alerts/{alert['key']}/action",
        json={"rule_id": alert["rule_id"], "actor_id": alert["actor_id"], "action": "acknowledged"},
    )
    assert resp.status_code == 200

    alerts_after = client.get("/v1/alerts").json()
    updated = next(a for a in alerts_after if a["key"] == alert["key"])
    assert updated["status"] == "acknowledged"
    assert updated["acknowledged_by"] is not None

    events_resp = client.get("/v1/events", params={"event_type": "alert.acknowledged"})
    assert events_resp.status_code == 200
    assert len(events_resp.json()) == 1


def test_no_alert_for_actors_below_threshold(client):
    # Only "mallory" was seeded with enough failed logins to cross the
    # threshold -- sanity check the rule doesn't fire for everyone.
    alerts = client.get("/v1/alerts").json()
    failed_login_alerts = [a for a in alerts if a["rule_id"] == "failed_logins"]
    assert all(a["actor_id"] == "mallory" for a in failed_login_alerts)
