"""Account self-service: request and cancel tenant-level deletion.

POST /v1/account/request-deletion  — admin verifies password, suspends tenant, queues for staff approval
DELETE /v1/account/request-deletion — admin cancels a pending deletion (while session is still valid)
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.security import verify_password
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter(prefix="/v1/account", tags=["account"])


class DeletionRequestBody(BaseModel):
    password: str
    reason: str = "Account deletion requested by admin"


@router.post("/request-deletion", status_code=200)
async def request_account_deletion(
    data: DeletionRequestBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if current_user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin role required.")
    if not current_user.tenant_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No tenant associated with account.")

    if not verify_password(data.password, current_user.password_hash, current_user.password_salt):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect password.")

    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    if tenant.pending_deletion:
        raise HTTPException(status.HTTP_409_CONFLICT, "A deletion request is already pending.")

    tenant.pending_deletion = True
    tenant.deletion_requested_at = datetime.now(timezone.utc)
    tenant.deletion_reason = data.reason[:1000] if data.reason else None
    # Suspend the tenant immediately — new logins will be denied by the platform
    tenant.is_active = False
    await db.commit()
    return {"ok": True}


@router.delete("/request-deletion", status_code=200)
async def cancel_account_deletion(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Admin cancels their own pending deletion while their session is still live."""
    if not current_user.tenant_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No tenant associated with account.")

    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    if not tenant.pending_deletion:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No pending deletion to cancel.")

    tenant.pending_deletion = False
    tenant.deletion_requested_at = None
    tenant.deletion_reason = None
    tenant.is_active = True
    await db.commit()
    return {"ok": True}
