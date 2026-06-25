from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

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
        source = await create_source(db, SourceCreate(name="investigate-test-source", source_kind="manual"))
        await append_event(
            db,
            EventCreate(
                occurred_at=datetime.now(timezone.utc),
                actor_type="user",
                actor_id="bob",
                event_type="auth.login",
                event_category="authentication",
                outcome="failure",
            ),
            source_id=source.id,
        )
        await db.commit()

    with TestClient(app) as c:
        c.cookies.set("session_token", token)
        yield c

    app.dependency_overrides.clear()


def test_investigate_returns_503_when_not_configured(client):
    # ANTHROPIC_API_KEY is empty in the test environment by default.
    resp = client.post("/v1/investigate", json={"question": "show failed logins by bob"})
    assert resp.status_code == 503


def test_investigate_with_mocked_llm(client):
    with (
        patch("app.api.v1.investigate.extract_search_filters", new=AsyncMock(return_value={"actor_id": "bob"})),
        patch(
            "app.api.v1.investigate.generate_report",
            new=AsyncMock(return_value="Bob had one failed login attempt."),
        ),
    ):
        resp = client.post("/v1/investigate", json={"question": "show failed logins by bob"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["filters_used"] == {"actor_id": "bob"}
    assert data["matched_count"] == 1
    assert data["report_text"] == "Bob had one failed login attempt."
    assert data["events"][0]["actor_id"] == "bob"
