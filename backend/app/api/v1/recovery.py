"""Emergency credential recovery endpoint.

Protected by RECOVERY_TOKEN env var. Set it in Railway, hit the endpoint
to reset any user's password (or create them if they don't exist), then
delete the env var immediately after.

POST /v1/recovery/reset-password
Headers: X-Recovery-Token: <your-RECOVERY_TOKEN>
Body: { "username": "admin", "new_password": "NewPassword99!" }

GET /v1/recovery/status
Headers: X-Recovery-Token: <your-RECOVERY_TOKEN>
Returns: count of users and tenants so you can see what's in the DB.
"""
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import settings
from app.core.security import validate_password_strength
from app.models.user import User
from app.schemas.tenant import TenantCreate
from app.schemas.user import UserCreate
from app.services.tenant_service import create_tenant, list_tenants
from app.services.user_service import create_user, get_user_by_username, set_user_password

router = APIRouter(prefix="/v1/recovery", tags=["recovery"])


def _check_token(x_recovery_token: str | None) -> None:
    recovery_token = settings.recovery_token
    if not recovery_token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recovery is not enabled on this instance.")
    if not x_recovery_token or not secrets.compare_digest(x_recovery_token, recovery_token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid recovery token.")


class ResetRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    new_password: str = Field(min_length=12, max_length=256)
    role: str = Field(default="admin")


@router.get("/status", status_code=status.HTTP_200_OK)
async def recovery_status(
    x_recovery_token: str | None = Header(default=None, alias="X-Recovery-Token"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Returns user + tenant counts so you can diagnose DB state without a shell."""
    _check_token(x_recovery_token)
    tenants = await list_tenants(db)
    users = list((await db.execute(select(User))).scalars().all())
    return {
        "tenant_count": len(tenants),
        "user_count": len(users),
        "tenants": [{"name": t.name, "slug": t.slug, "is_active": t.is_active} for t in tenants],
        "users": [{"username": u.username, "role": u.role, "is_active": u.is_active} for u in users],
    }


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def recovery_reset_password(
    data: ResetRequest,
    x_recovery_token: str | None = Header(default=None, alias="X-Recovery-Token"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reset a user's password, or create them (+ a tenant) if they don't exist."""
    _check_token(x_recovery_token)

    err = validate_password_strength(data.new_password, settings.password_min_length)
    if err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, err)

    user = await get_user_by_username(db, data.username)

    if user is None:
        if data.role == "super_admin":
            user = await create_user(
                db,
                UserCreate(username=data.username, password=data.new_password, role="super_admin"),
            )
            return {
                "ok": True,
                "created": True,
                "message": f"Created super_admin '{user.username}'. Remove RECOVERY_TOKEN now.",
            }

        tenants = await list_tenants(db)
        if tenants:
            tenant = tenants[0]
            created_tenant = False
        else:
            tenant = await create_tenant(db, TenantCreate(name="Default Organisation", slug="default"))
            created_tenant = True

        user = await create_user(
            db,
            UserCreate(
                username=data.username,
                password=data.new_password,
                role=data.role,
                tenant_id=tenant.id,
            ),
        )
        msg = (
            f"Created {data.role} user '{user.username}' in tenant '{tenant.name}'"
            + (" (new tenant also created)" if created_tenant else "")
            + ". Remove RECOVERY_TOKEN from Railway env vars now."
        )
        return {"ok": True, "created": True, "message": msg}

    await set_user_password(db, user, data.new_password)
    return {
        "ok": True,
        "created": False,
        "message": f"Password reset for '{user.username}'. Remove RECOVERY_TOKEN from Railway env vars now.",
    }


class PromoteRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)


@router.post("/promote-super-admin", status_code=status.HTTP_200_OK)
async def promote_super_admin(
    data: PromoteRequest,
    x_recovery_token: str | None = Header(default=None, alias="X-Recovery-Token"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Fix the DB constraint and promote an existing user to super_admin.
    Use this when reset-password with role=super_admin returns 500."""
    _check_token(x_recovery_token)

    user = (await db.execute(select(User).where(User.username == data.username))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"User '{data.username}' not found.")

    try:
        await db.execute(
            text("UPDATE app.users SET role = 'super_admin' WHERE username = :u"),
            {"u": data.username},
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "message": f"'{data.username}' is now super_admin. Remove RECOVERY_TOKEN now."}
