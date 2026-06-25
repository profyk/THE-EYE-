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

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


def test_submit_whistleblower_report_requires_no_auth(client):
    resp = client.post("/v1/whistleblower", json={"report": "Suspicious payment to vendor X", "category": "fraud"})
    assert resp.status_code == 201
    assert resp.json()["received"] is True


async def test_submission_has_no_ip_or_geo_metadata(client, test_db):
    client.post("/v1/whistleblower", json={"report": "Test report", "category": "corruption"})

    admin = await create_test_user(test_db, username="admin", password="admin-password-123", role="admin")
    token = await create_test_session_token(test_db, admin)

    resp = client.get(
        "/v1/events",
        params={"event_type": "whistleblower.report_submitted"},
        cookies={"session_token": token},
    )
    assert resp.status_code == 200
    events = resp.json()
    assert len(events) == 1
    assert events[0]["origin_ip"] is None
    assert "geo" not in events[0]["metadata"]
    assert events[0]["actor_id"] == "anonymous"
    # The ledger never gets the raw report text -- only an id + content hash
    # (the full text lives in app.whistleblower_reports, a separate redactable table).
    assert "report" not in events[0]["metadata"]
    assert "report_id" in events[0]["metadata"]
    assert len(events[0]["metadata"]["report_sha256"]) == 64


def test_whistleblower_rate_limit(client):
    for _ in range(5):
        resp = client.post("/v1/whistleblower", json={"report": "spam", "category": "other"})
        assert resp.status_code == 201

    blocked = client.post("/v1/whistleblower", json={"report": "one too many", "category": "other"})
    assert blocked.status_code == 429


async def test_admin_can_read_full_report_text(client, test_db):
    submit_resp = client.post("/v1/whistleblower", json={"report": "Full report body", "category": "safety"})
    assert submit_resp.status_code == 201

    admin = await create_test_user(test_db, username="admin", password="admin-password-123", role="admin")
    token = await create_test_session_token(test_db, admin)

    events_resp = client.get(
        "/v1/events",
        params={"event_type": "whistleblower.report_submitted"},
        cookies={"session_token": token},
    )
    report_id = events_resp.json()[0]["metadata"]["report_id"]

    report_resp = client.get(f"/v1/whistleblower/reports/{report_id}", cookies={"session_token": token})
    assert report_resp.status_code == 200
    data = report_resp.json()
    assert data["report_text"] == "Full report body"
    assert data["category"] == "safety"


async def test_non_investigator_cannot_read_report_text(client, test_db):
    submit_resp = client.post("/v1/whistleblower", json={"report": "Secret report", "category": "other"})
    assert submit_resp.status_code == 201

    admin = await create_test_user(test_db, username="admin2", password="admin-password-123", role="admin")
    admin_token = await create_test_session_token(test_db, admin)
    events_resp = client.get(
        "/v1/events",
        params={"event_type": "whistleblower.report_submitted"},
        cookies={"session_token": admin_token},
    )
    report_id = events_resp.json()[0]["metadata"]["report_id"]

    chief_auditor = await create_test_user(
        test_db, username="chief-auditor-1", password="password1234", role="chief_auditor"
    )
    chief_auditor_token = await create_test_session_token(test_db, chief_auditor)

    report_resp = client.get(
        f"/v1/whistleblower/reports/{report_id}", cookies={"session_token": chief_auditor_token}
    )
    assert report_resp.status_code == 403
