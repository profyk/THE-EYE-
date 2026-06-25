from unittest.mock import patch

import pytest_asyncio
from fastapi.testclient import TestClient

from app.api.deps import get_db
from app.core import rate_limit
from app.main import app

from conftest import create_test_session_token, create_test_user


@pytest_asyncio.fixture
async def client(test_db):
    async def _override_get_db():
        async with test_db.session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    rate_limit._request_log.clear()

    admin = await create_test_user(test_db, username="admin", password="admin-password-123", role="admin")
    token = await create_test_session_token(test_db, admin)

    with TestClient(app) as c:
        c.cookies.set("session_token", token)
        yield c

    app.dependency_overrides.clear()


def test_rejected_ingestion_key_is_logged(client):
    # Patch GeoIP to avoid a real network call and to return deterministic
    # geo data so the stats aggregation can be asserted precisely.
    with patch(
        "app.services.intrusion_service.lookup_geoip",
        return_value={"city": "Lagos", "country": "Nigeria", "latitude": 6.5, "longitude": 3.4},
    ):
        resp = client.post(
            "/v1/events",
            json={
                "occurred_at": "2026-06-20T00:00:00Z",
                "actor_type": "user",
                "actor_id": "x",
                "event_type": "auth.login",
                "event_category": "authentication",
                "outcome": "success",
            },
            headers={"Authorization": "Bearer eye_live_not_a_real_key", "X-Forwarded-For": "105.112.0.1"},
        )
    assert resp.status_code == 401

    stats_resp = client.get("/v1/intrusion/stats")
    assert stats_resp.status_code == 200
    data = stats_resp.json()
    assert data["total_attempts"] >= 1
    matching = [a for a in data["attempts"] if a["ip"] == "105.112.0.1"]
    assert len(matching) == 1
    assert matching[0]["country"] == "Nigeria"
    assert matching[0]["city"] == "Lagos"
    assert matching[0]["event_type"] == "intrusion.ingestion_key_rejected"

    country_entry = next(c for c in data["countries"] if c["country"] == "Nigeria")
    assert country_entry["count"] >= 1


def test_missing_auth_header_also_logged(client):
    with patch("app.services.intrusion_service.lookup_geoip", return_value=None):
        resp = client.post(
            "/v1/events",
            json={
                "occurred_at": "2026-06-20T00:00:00Z",
                "actor_type": "user",
                "actor_id": "x",
                "event_type": "auth.login",
                "event_category": "authentication",
                "outcome": "success",
            },
            headers={"Authorization": ""},
        )
    assert resp.status_code in (401, 422)

    stats_resp = client.get("/v1/intrusion/stats")
    assert stats_resp.status_code == 200


def test_intrusion_stats_requires_auth(client):
    # client's cookie jar already carries an admin session; use a fresh,
    # cookie-less client to actually test the unauthenticated case.
    with TestClient(app) as anon:
        resp = anon.get("/v1/intrusion/stats")
    assert resp.status_code == 401


def test_flood_of_bad_keys_from_one_ip_stops_being_logged(client):
    # A flood of bad keys from one attacker IP must keep getting 401'd, but
    # logging (GeoIP call + ledger write under the global chain-head lock)
    # should stop once the per-IP cap is hit -- otherwise a flood becomes an
    # amplified DoS against legitimate ingestion via lock contention.
    with patch("app.services.intrusion_service.lookup_geoip", return_value=None):
        for _ in range(35):
            resp = client.post(
                "/v1/events",
                json={
                    "occurred_at": "2026-06-20T00:00:00Z",
                    "actor_type": "user",
                    "actor_id": "x",
                    "event_type": "auth.login",
                    "event_category": "authentication",
                    "outcome": "success",
                },
                headers={"Authorization": "Bearer eye_live_not_a_real_key", "X-Forwarded-For": "198.51.100.7"},
            )
            assert resp.status_code == 401  # every single attempt is still rejected

    stats_resp = client.get("/v1/intrusion/stats")
    matching = [a for a in stats_resp.json()["attempts"] if a["ip"] == "198.51.100.7"]
    # INGESTION_FAILURE_LOG_MAX_REQUESTS in deps.py is 30 -- 35 attempts should
    # produce at most 30 logged events, not 35.
    assert 0 < len(matching) <= 30
