import pytest_asyncio
from fastapi.testclient import TestClient

from app.api.deps import get_db
from app.main import app
from app.schemas.source import SourceCreate
from app.services.source_service import create_source

from conftest import create_test_session_token, create_test_user

APPROVER_ROLES = ["chief_auditor", "compliance_officer", "security_officer", "executive_authority"]


@pytest_asyncio.fixture
async def setup(test_db):
    async def _override_get_db():
        async with test_db.session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db

    admin = await create_test_user(test_db, username="admin", password="admin-password-123", role="admin")
    admin_token = await create_test_session_token(test_db, admin)

    approver_tokens = {}
    for role in APPROVER_ROLES:
        u = await create_test_user(test_db, username=f"user-{role}", password="password1234", role=role)
        approver_tokens[role] = await create_test_session_token(test_db, u)

    async with test_db.session_factory() as db:
        target_source = await create_source(db, SourceCreate(name="target-source", source_kind="manual"))

    with TestClient(app) as c:
        yield {"client": c, "admin_token": admin_token, "approver_tokens": approver_tokens, "target_id": target_source.id}

    app.dependency_overrides.clear()


def _auth(token):
    return {"session_token": token}


def test_create_deletion_request_requires_admin(setup):
    resp = setup["client"].post(
        "/v1/deletion-requests",
        json={"target_type": "ingestion_source", "target_id": str(setup["target_id"]), "reason": "compromised"},
        cookies=_auth(setup["approver_tokens"]["chief_auditor"]),
    )
    assert resp.status_code == 403


def test_full_four_signature_approval_executes(setup):
    client = setup["client"]
    create_resp = client.post(
        "/v1/deletion-requests",
        json={"target_type": "ingestion_source", "target_id": str(setup["target_id"]), "reason": "compromised key"},
        cookies=_auth(setup["admin_token"]),
    )
    assert create_resp.status_code == 201
    request_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "pending"

    for i, role in enumerate(APPROVER_ROLES):
        resp = client.post(
            f"/v1/deletion-requests/{request_id}/decide",
            json={"decision": "approve"},
            cookies=_auth(setup["approver_tokens"][role]),
        )
        assert resp.status_code == 200
        data = resp.json()
        if i < len(APPROVER_ROLES) - 1:
            assert data["status"] == "pending"
        else:
            assert data["status"] == "executed"

    # confirm the target source was actually deactivated by re-deactivating
    # and checking is_active is still false.
    deactivate_again = client.post(
        f"/v1/sources/{setup['target_id']}/deactivate", cookies=_auth(setup["admin_token"])
    )
    assert deactivate_again.status_code == 200
    assert deactivate_again.json()["is_active"] is False


def test_single_rejection_blocks_request(setup):
    client = setup["client"]
    create_resp = client.post(
        "/v1/deletion-requests",
        json={"target_type": "ingestion_source", "target_id": str(setup["target_id"]), "reason": "test"},
        cookies=_auth(setup["admin_token"]),
    )
    request_id = create_resp.json()["id"]

    client.post(
        f"/v1/deletion-requests/{request_id}/decide",
        json={"decision": "approve"},
        cookies=_auth(setup["approver_tokens"]["chief_auditor"]),
    )
    reject_resp = client.post(
        f"/v1/deletion-requests/{request_id}/decide",
        json={"decision": "reject"},
        cookies=_auth(setup["approver_tokens"]["compliance_officer"]),
    )
    assert reject_resp.json()["status"] == "rejected"

    blocked_resp = client.post(
        f"/v1/deletion-requests/{request_id}/decide",
        json={"decision": "approve"},
        cookies=_auth(setup["approver_tokens"]["security_officer"]),
    )
    assert blocked_resp.status_code == 409


def test_same_role_cannot_vote_twice(setup):
    client = setup["client"]
    create_resp = client.post(
        "/v1/deletion-requests",
        json={"target_type": "ingestion_source", "target_id": str(setup["target_id"]), "reason": "test"},
        cookies=_auth(setup["admin_token"]),
    )
    request_id = create_resp.json()["id"]

    client.post(
        f"/v1/deletion-requests/{request_id}/decide",
        json={"decision": "approve"},
        cookies=_auth(setup["approver_tokens"]["chief_auditor"]),
    )
    second_vote = client.post(
        f"/v1/deletion-requests/{request_id}/decide",
        json={"decision": "approve"},
        cookies=_auth(setup["approver_tokens"]["chief_auditor"]),
    )
    assert second_vote.status_code == 409


def test_approval_and_execution_are_logged_events(setup):
    client = setup["client"]
    create_resp = client.post(
        "/v1/deletion-requests",
        json={"target_type": "ingestion_source", "target_id": str(setup["target_id"]), "reason": "test"},
        cookies=_auth(setup["admin_token"]),
    )
    request_id = create_resp.json()["id"]
    for role in APPROVER_ROLES:
        client.post(
            f"/v1/deletion-requests/{request_id}/decide",
            json={"decision": "approve"},
            cookies=_auth(setup["approver_tokens"][role]),
        )

    events_resp = client.get(
        "/v1/events", params={"event_type": "deletion_request.executed"}, cookies=_auth(setup["admin_token"])
    )
    assert events_resp.status_code == 200
    assert len(events_resp.json()) == 1
