import pytest_asyncio
from fastapi.testclient import TestClient

from app.api.deps import get_db
from app.main import app

from conftest import create_test_session_token, create_test_user


@pytest_asyncio.fixture
async def admin_client(test_db):
    async def _override_get_db():
        async with test_db.session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db

    admin = await create_test_user(test_db, username="admin", password="admin-password-123", role="admin")
    token = await create_test_session_token(test_db, admin)

    with TestClient(app) as c:
        c.cookies.set("session_token", token)
        yield c

    app.dependency_overrides.clear()


def test_create_user(admin_client):
    resp = admin_client.post(
        "/v1/users", json={"username": "new-investigator", "password": "password1234", "role": "investigator"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "new-investigator"
    assert data["role"] == "investigator"
    assert data["is_active"] is True


def test_create_user_duplicate_username_rejected(admin_client):
    admin_client.post("/v1/users", json={"username": "dupe", "password": "password1234", "role": "investigator"})
    resp = admin_client.post("/v1/users", json={"username": "dupe", "password": "password1234", "role": "investigator"})
    assert resp.status_code == 409


def test_list_users(admin_client):
    admin_client.post("/v1/users", json={"username": "listed-user", "password": "password1234", "role": "investigator"})
    resp = admin_client.get("/v1/users")
    assert resp.status_code == 200
    usernames = [u["username"] for u in resp.json()]
    assert "admin" in usernames
    assert "listed-user" in usernames


def test_deactivate_user(admin_client):
    create_resp = admin_client.post(
        "/v1/users", json={"username": "to-deactivate", "password": "password1234", "role": "investigator"}
    )
    user_id = create_resp.json()["id"]

    resp = admin_client.post(f"/v1/users/{user_id}/deactivate")
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


async def test_non_admin_cannot_manage_users(admin_client, test_db):
    investigator = await create_test_user(
        test_db, username="plain-investigator", password="password1234", role="investigator"
    )
    token = await create_test_session_token(test_db, investigator)

    resp = admin_client.get("/v1/users", cookies={"session_token": token})
    assert resp.status_code == 403


def test_reset_password_then_login_with_new_password(admin_client):
    create_resp = admin_client.post(
        "/v1/users", json={"username": "needs-reset", "password": "original-password1", "role": "investigator"}
    )
    user_id = create_resp.json()["id"]

    reset_resp = admin_client.post(f"/v1/users/{user_id}/reset-password", json={"new_password": "brand-new-password1"})
    assert reset_resp.status_code == 200

    with TestClient(app) as anon:
        old_login = anon.post("/v1/auth/login", json={"username": "needs-reset", "password": "original-password1"})
        assert old_login.status_code == 401

        new_login = anon.post("/v1/auth/login", json={"username": "needs-reset", "password": "brand-new-password1"})
        assert new_login.status_code == 200
