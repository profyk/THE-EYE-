from datetime import datetime, timezone

import pytest_asyncio
from fastapi.testclient import TestClient

from app.api.deps import get_db
from app.core import rate_limit
from app.main import app
from app.schemas.source import SourceCreate
from app.services.source_service import create_source

from conftest import create_test_session_token, create_test_user


@pytest_asyncio.fixture
async def client(test_db):
    async def _override_get_db():
        async with test_db.session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    rate_limit._request_log.clear()

    async with test_db.session_factory() as db:
        created = await create_source(db, SourceCreate(name="api-test-source", source_kind="manual"))

    admin = await create_test_user(test_db, username="admin", password="admin-password-123", role="admin")
    admin_token = await create_test_session_token(test_db, admin)

    with TestClient(app) as c:
        c.headers.update({"Authorization": f"Bearer {created.api_key}"})
        c.admin_token = admin_token  # type: ignore[attr-defined]
        yield c

    app.dependency_overrides.clear()


def _valid_event_body(**overrides):
    body = {
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "actor_type": "user",
        "actor_id": "alice",
        "event_type": "auth.login",
        "event_category": "authentication",
        "outcome": "success",
    }
    body.update(overrides)
    return body


def test_submit_event_returns_sequence_and_hash(client):
    resp = client.post("/v1/events", json=_valid_event_body())
    assert resp.status_code == 201
    data = resp.json()
    assert data["sequence_num"] == 1
    assert len(data["record_hash"]) == 64


def test_submit_event_without_api_key_rejected(client):
    resp = client.post(
        "/v1/events",
        json=_valid_event_body(),
        headers={"Authorization": ""},
    )
    assert resp.status_code in (401, 422)


def test_submit_event_with_bad_api_key_rejected(client):
    resp = client.post(
        "/v1/events",
        json=_valid_event_body(),
        headers={"Authorization": "Bearer eye_live_not_a_real_key"},
    )
    assert resp.status_code == 401


def test_submit_event_with_forbidden_metadata_rejected(client):
    resp = client.post("/v1/events", json=_valid_event_body(metadata={"screenshot": "..."}))
    assert resp.status_code == 422


def test_submit_event_with_future_occurred_at_rejected(client):
    from datetime import timedelta

    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    resp = client.post("/v1/events", json=_valid_event_body(occurred_at=future))
    assert resp.status_code == 422


def test_batch_submit_links_chain(client):
    resp = client.post(
        "/v1/events/batch",
        json={"events": [_valid_event_body(), _valid_event_body(actor_id="bob")]},
    )
    assert resp.status_code == 201
    results = resp.json()["results"]
    assert len(results) == 2
    assert results[0]["sequence_num"] != results[1]["sequence_num"]


def test_search_events_requires_admin_session_not_source_key(client):
    # The source's own API key should NOT grant access to the admin-gated search endpoint
    resp = client.get("/v1/events")
    assert resp.status_code == 401


def test_search_events_with_admin_session(client):
    client.post("/v1/events", json=_valid_event_body())
    resp = client.get("/v1/events", cookies={"session_token": client.admin_token})
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
