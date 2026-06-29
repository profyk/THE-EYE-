"""Emergency credential recovery endpoint.

Protected by RECOVERY_TOKEN env var. Set it in Railway, hit the endpoint
to reset any user's password, then delete the env var immediately after.

POST /v1/recovery/reset-password
Headers: X-Recovery-Token: <your-RECOVERY_TOKEN>
Body: { "username": "admin", "new_password": "NewPassword99!" }
"""
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import settings
from app.core.security import validate_password_strength
from app.services.user_service import get_user_by_username, set_user_password

router = APIRouter(prefix="/v1/recovery", tags=["recovery"])


class ResetRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    new_password: str = Field(min_length=12, max_length=256)


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def recovery_reset_password(
    data: ResetRequest,
    x_recovery_token: str | None = Header(default=None, alias="X-Recovery-Token"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    recovery_token = settings.recovery_token
    if not recovery_token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recovery is not enabled on this instance.")

    if not x_recovery_token or not secrets.compare_digest(x_recovery_token, recovery_token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid recovery token.")

    err = validate_password_strength(data.new_password, settings.password_min_length)
    if err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, err)

    user = await get_user_by_username(db, data.username)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No user '{data.username}' found.")

    await set_user_password(db, user, data.new_password)
    return {"ok": True, "message": f"Password reset for '{user.username}'. Remove RECOVERY_TOKEN from env vars now."}
