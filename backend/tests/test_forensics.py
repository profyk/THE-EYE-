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


@pytest_asyncio.fixture
async def client(test_db):
    async def _override_get_db():
        async with test_db.session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db

    admin = await create_test_user(test_db, username="admin", password="admin-password-123", role="admin")
    token = await create_test_session_token(test_db, admin)

    async with test_db.session_factory() as db:
        source = await create_source(db, SourceCreate(name="forensics-test-source", source_kind="manual"))
        await append_event(
            db,
            EventCreate(
                occurred_at=datetime.now(timezone.utc),
                actor_type="user",
                actor_id="alice",
                event_type="file.read",
                event_category="data_access",
                outcome="success",
                target_type="document",
                target_id="doc-123",
            ),
            source_id=source.id,
        )
        await append_event(
            db,
            EventCreate(
                occurred_at=datetime.now(timezone.utc),
                actor_type="user",
                actor_id="bob",
                event_type="file.read",
                event_category="data_access",
                outcome="success",
                target_type="document",
                target_id="doc-123",
            ),
            source_id=source.id,
        )
        await db.commit()

    with TestClient(app) as c:
        c.cookies.set("session_token", token)
        yield c

    app.dependency_overrides.clear()


def test_free_text_search(client):
    resp = client.get("/v1/events", params={"q": "alice"})
    assert resp.status_code == 200
    assert all("alice" in e["actor_id"] for e in resp.json())


def test_export_json(client):
    resp = client.get("/v1/events/export", params={"format": "json"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")
    assert "attachment" in resp.headers["content-disposition"]
    import json

    data = json.loads(resp.content)
    assert len(data) >= 2


def test_export_csv(client):
    resp = client.get("/v1/events/export", params={"format": "csv"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "actor_id" in resp.text.splitlines()[0]


def test_chain_verify(client):
    resp = client.get("/v1/chain/verify")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["records_checked"] >= 2
    assert data["divergences"] == []


def test_forensics_network(client):
    resp = client.get("/v1/forensics/network")
    assert resp.status_code == 200
    data = resp.json()
    node_labels = [n["label"] for n in data["nodes"]]
    assert "alice" in node_labels
    assert "bob" in node_labels
    assert any(e["weight"] >= 1 for e in data["edges"])
