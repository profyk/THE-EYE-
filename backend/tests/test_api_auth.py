import pytest_asyncio
from fastapi.testclient import TestClient

from app.api.deps import get_db
from app.core import rate_limit
from app.main import app

from conftest import create_test_session_token, create_test_user

ADMIN_USERNAME = "test-admin"
ADMIN_PASSWORD = "test-admin-password"


@pytest_asyncio.fixture
async def client(test_db):
    async def _override_get_db():
        async with test_db.session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    rate_limit._request_log.clear()
    await create_test_user(test_db, username=ADMIN_USERNAME, password=ADMIN_PASSWORD, role="admin")

    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_login_with_correct_credentials_succeeds(client):
    resp = client.post("/v1/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == ADMIN_USERNAME
    assert data["role"] == "admin"
    assert "token" not in data  # session lives only in the httpOnly cookie, never in the JSON body
    assert len(resp.cookies.get("session_token", "")) > 20


def test_login_with_wrong_password_rejected(client):
    resp = client.post("/v1/auth/login", json={"username": ADMIN_USERNAME, "password": "wrong"})
    assert resp.status_code == 401


def test_login_with_unknown_username_rejected(client):
    resp = client.post("/v1/auth/login", json={"username": "nobody", "password": "irrelevant"})
    assert resp.status_code == 401


def test_every_login_attempt_is_logged_to_the_ledger(client):
    client.post("/v1/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    client.post("/v1/auth/login", json={"username": ADMIN_USERNAME, "password": "wrong"})
    client.post("/v1/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})

    # The last successful login's session cookie is already on `client`'s
    # cookie jar (TestClient persists Set-Cookie across requests like a browser).
    events_resp = client.get("/v1/events", params={"event_type": "auth.dashboard_login"})
    assert events_resp.status_code == 200
    outcomes = [e["outcome"] for e in events_resp.json()]
    assert outcomes.count("success") >= 2
    assert outcomes.count("failure") >= 1


def test_create_source_requires_auth(client):
    resp = client.post("/v1/sources", json={"name": "new-source", "source_kind": "manual"})
    assert resp.status_code == 401


def test_create_source_with_admin_session_returns_key_once(client):
    login_resp = client.post("/v1/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert login_resp.status_code == 200

    # The session cookie set by login is already on `client`'s cookie jar.
    resp = client.post("/v1/sources", json={"name": "new-source", "source_kind": "manual"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["api_key"].startswith("eye_live_")
    assert data["api_key_prefix"] in data["api_key"]


async def test_investigator_cannot_create_sources(client, test_db):
    user = await create_test_user(test_db, username="test-investigator", password="irrelevant123", role="investigator")
    token = await create_test_session_token(test_db, user)

    resp = client.post(
        "/v1/sources",
        json={"name": "blocked-source", "source_kind": "manual"},
        cookies={"session_token": token},
    )
    assert resp.status_code == 403


def test_logout_clears_session(client):
    client.post("/v1/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert client.post("/v1/sources", json={"name": "pre-logout", "source_kind": "manual"}).status_code == 201

    logout_resp = client.post("/v1/auth/logout")
    assert logout_resp.status_code == 204
    assert client.cookies.get("session_token") is None

    resp = client.post("/v1/sources", json={"name": "post-logout", "source_kind": "manual"})
    assert resp.status_code == 401


def test_login_rate_limited_per_username(client):
    # USERNAME_RATE_LIMIT_MAX_REQUESTS in auth.py is 8 per window.
    for _ in range(8):
        resp = client.post("/v1/auth/login", json={"username": ADMIN_USERNAME, "password": "wrong"})
        assert resp.status_code == 401

    blocked = client.post("/v1/auth/login", json={"username": ADMIN_USERNAME, "password": "wrong"})
    assert blocked.status_code == 429
