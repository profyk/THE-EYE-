from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deletion_request import APPROVER_ROLES, DeletionApproval, DeletionRequest
from app.models.user import User
from app.services.source_service import deactivate_source
from app.services.user_service import deactivate_user


class AlreadyDecidedError(Exception):
    pass


class RoleAlreadyVotedError(Exception):
    pass


async def create_request(
    db: AsyncSession, *, requested_by: User, target_type: str, target_id: UUID, reason: str, tenant_id: UUID
) -> DeletionRequest:
    request = DeletionRequest(
        tenant_id=tenant_id,
        requested_by=requested_by.id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    db.add(request)
    await db.commit()
    await db.refresh(request)
    return request


async def list_requests(db: AsyncSession, *, tenant_id: UUID) -> list[DeletionRequest]:
    return list(
        (
            await db.execute(
                select(DeletionRequest)
                .where(DeletionRequest.tenant_id == tenant_id)
                .order_by(DeletionRequest.created_at.desc())
            )
        ).scalars().all()
    )


async def get_request(db: AsyncSession, request_id: UUID, *, tenant_id: UUID) -> DeletionRequest | None:
    return (
        await db.execute(
            select(DeletionRequest).where(DeletionRequest.id == request_id, DeletionRequest.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()


async def get_approvals(db: AsyncSession, request_id: UUID) -> list[DeletionApproval]:
    return list(
        (
            await db.execute(select(DeletionApproval).where(DeletionApproval.request_id == request_id))
        ).scalars().all()
    )


async def decide(
    db: AsyncSession, *, request: DeletionRequest, approver: User, decision: str
) -> tuple[DeletionRequest, bool]:
    """Records one approver role's decision. Returns (request, executed) --
    executed is True only on the call that completes the 4th distinct
    approver-role approval and actually performs the gated action. A single
    rejection from any approver role blocks the request immediately."""
    if request.status != "pending":
        raise AlreadyDecidedError(f"Request is already {request.status}")

    existing_role_vote = (
        await db.execute(
            select(DeletionApproval).where(
                DeletionApproval.request_id == request.id, DeletionApproval.approver_role == approver.role
            )
        )
    ).scalar_one_or_none()
    if existing_role_vote is not None:
        raise RoleAlreadyVotedError(f"Role '{approver.role}' has already voted on this request")

    db.add(
        DeletionApproval(
            request_id=request.id,
            approver_user_id=approver.id,
            approver_role=approver.role,
            decision=decision,
            decided_at=datetime.now(timezone.utc),
        )
    )

    if decision == "reject":
        request.status = "rejected"
        await db.commit()
        return request, False

    await db.flush()
    approvals = await get_approvals(db, request.id)
    approved_roles = {a.approver_role for a in approvals if a.decision == "approve"}

    executed = False
    if set(APPROVER_ROLES).issubset(approved_roles):
        await _execute(db, request)
        request.status = "executed"
        executed = True
    else:
        request.status = "pending"

    await db.commit()
    return request, executed


async def _execute(db: AsyncSession, request: DeletionRequest) -> None:
    if request.target_type == "user":
        await deactivate_user(db, request.target_id, tenant_id=request.tenant_id)
    elif request.target_type == "ingestion_source":
        await deactivate_source(db, request.target_id, tenant_id=request.tenant_id)
