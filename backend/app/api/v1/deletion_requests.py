from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role
from app.ledger.append import append_event
from app.models.deletion_request import APPROVER_ROLES
from app.models.user import User
from app.schemas.deletion_request import (
    DeletionApprovalRead,
    DeletionDecisionRequest,
    DeletionRequestCreate,
    DeletionRequestRead,
)
from app.schemas.event import EventCreate
from app.services.deletion_request_service import (
    AlreadyDecidedError,
    RoleAlreadyVotedError,
    create_request,
    decide,
    get_approvals,
    get_request,
    list_requests,
)
from app.services.source_service import get_source_by_name

router = APIRouter(prefix="/v1/deletion-requests", tags=["deletion-requests"])
PLATFORM_SOURCE_NAME = "the-eye-platform"

VIEW_ROLES = ("admin", *APPROVER_ROLES)


async def _log(db: AsyncSession, *, actor: User, event_type: str, target_id, metadata: dict) -> None:
    source = await get_source_by_name(db, PLATFORM_SOURCE_NAME)
    if source is None:
        return
    event = EventCreate(
        occurred_at=datetime.now(timezone.utc),
        actor_type="user",
        actor_id=actor.username,
        event_type=event_type,
        event_category="administrative",
        outcome="success",
        target_type="deletion_request",
        target_id=str(target_id),
        metadata=metadata,
    )
    await append_event(db, event, source_id=source.id, tenant_id=actor.tenant_id)
    await db.commit()


async def _to_read(db: AsyncSession, request) -> DeletionRequestRead:
    approvals = await get_approvals(db, request.id)
    return DeletionRequestRead(
        id=request.id,
        requested_by=request.requested_by,
        target_type=request.target_type,
        target_id=request.target_id,
        reason=request.reason,
        status=request.status,
        created_at=request.created_at,
        approvals=[
            DeletionApprovalRead(approver_role=a.approver_role, decision=a.decision, decided_at=a.decided_at)
            for a in approvals
        ],
    )


@router.post("", response_model=DeletionRequestRead, status_code=status.HTTP_201_CREATED)
async def create_deletion_request(
    body: DeletionRequestCreate,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
) -> DeletionRequestRead:
    request = await create_request(
        db,
        requested_by=user,
        target_type=body.target_type,
        target_id=body.target_id,
        reason=body.reason,
        tenant_id=user.tenant_id,
    )
    await _log(
        db,
        actor=user,
        event_type="deletion_request.created",
        target_id=request.id,
        metadata={"target_type": body.target_type, "target_id": str(body.target_id), "reason": body.reason},
    )
    return await _to_read(db, request)


@router.get("", response_model=list[DeletionRequestRead])
async def list_deletion_requests(
    user: User = Depends(require_role(*VIEW_ROLES)),
    db: AsyncSession = Depends(get_db),
) -> list[DeletionRequestRead]:
    requests = await list_requests(db, tenant_id=user.tenant_id)
    return [await _to_read(db, r) for r in requests]


@router.post("/{request_id}/decide", response_model=DeletionRequestRead)
async def decide_deletion_request(
    request_id: UUID,
    body: DeletionDecisionRequest,
    user: User = Depends(require_role(*APPROVER_ROLES)),
    db: AsyncSession = Depends(get_db),
) -> DeletionRequestRead:
    request = await get_request(db, request_id, tenant_id=user.tenant_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deletion request not found")

    try:
        request, executed = await decide(db, request=request, approver=user, decision=body.decision)
    except AlreadyDecidedError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    except RoleAlreadyVotedError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))

    if executed:
        event_type = "deletion_request.executed"
    elif body.decision == "approve":
        event_type = "deletion_request.approved"
    else:
        event_type = "deletion_request.rejected"
    await _log(
        db,
        actor=user,
        event_type=event_type,
        target_id=request.id,
        metadata={"approver_role": user.role, "decision": body.decision},
    )
    return await _to_read(db, request)
