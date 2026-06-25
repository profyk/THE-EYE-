import pytest_asyncio
from fastapi.testclient import TestClient

from app.api.deps import get_db
from app.main import app

from conftest import create_test_session_token, create_test_user


@pytest_asyncio.fixture
async def client(test_db):
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


def test_list_sources(client):
    client.post("/v1/sources", json={"name": "src-a", "source_kind": "manual"})
    client.post("/v1/sources", json={"name": "src-b", "source_kind": "manual"})

    resp = client.get("/v1/sources")
    assert resp.status_code == 200
    names = [s["name"] for s in resp.json()]
    assert "src-a" in names
    assert "src-b" in names
    assert "api_key" not in resp.json()[0]
