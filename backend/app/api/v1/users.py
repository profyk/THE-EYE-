from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role
from app.config import settings
from app.core.security import validate_password_strength
from app.models.user import User
from app.schemas.user import Role, SetPasswordRequest, UserCreate, UserRead
from app.services.user_service import (
    change_role,
    count_active_admins,
    create_user,
    deactivate_user,
    get_user_by_id,
    get_user_by_username,
    list_users,
    reactivate_user,
    set_user_password,
)

router = APIRouter(prefix="/v1/users", tags=["users"], dependencies=[Depends(require_role("admin"))])


class RoleChangeRequest(BaseModel):
    role: Role


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user_endpoint(
    data: UserCreate, db: AsyncSession = Depends(get_db), caller: User = Depends(require_role("admin"))
) -> UserRead:
    if await get_user_by_username(db, data.username) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    err = validate_password_strength(data.password, settings.password_min_length)
    if err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, err)
    data = data.model_copy(update={"tenant_id": caller.tenant_id})
    user = await create_user(db, data)
    return UserRead.model_validate(user)


@router.get("", response_model=list[UserRead])
async def list_users_endpoint(
    db: AsyncSession = Depends(get_db), caller: User = Depends(require_role("admin"))
) -> list[UserRead]:
    users = await list_users(db, tenant_id=caller.tenant_id)
    return [UserRead.model_validate(u) for u in users]


@router.patch("/{user_id}/role", response_model=UserRead)
async def change_role_endpoint(
    user_id: UUID,
    data: RoleChangeRequest,
    db: AsyncSession = Depends(get_db),
    caller: User = Depends(require_role("admin")),
) -> UserRead:
    if user_id == caller.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot change your own role")
    # If demoting the target away from admin, make sure another active admin remains.
    target = await get_user_by_id(db, user_id, tenant_id=caller.tenant_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.role == "admin" and data.role != "admin":
        if await count_active_admins(db, tenant_id=caller.tenant_id) <= 1:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Cannot demote the last active admin — promote another user first",
            )
    user = await change_role(db, user_id, data.role, tenant_id=caller.tenant_id)
    return UserRead.model_validate(user)


@router.post("/{user_id}/reactivate", response_model=UserRead)
async def reactivate_user_endpoint(
    user_id: UUID, db: AsyncSession = Depends(get_db), caller: User = Depends(require_role("admin"))
) -> UserRead:
    if user_id == caller.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use your profile settings to manage your own account")
    user = await reactivate_user(db, user_id, tenant_id=caller.tenant_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return UserRead.model_validate(user)


@router.post("/{user_id}/deactivate", response_model=UserRead)
async def deactivate_user_endpoint(
    user_id: UUID, db: AsyncSession = Depends(get_db), caller: User = Depends(require_role("admin"))
) -> UserRead:
    if user_id == caller.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot block your own account")
    target = await get_user_by_id(db, user_id, tenant_id=caller.tenant_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.role == "admin" and target.is_active:
        if await count_active_admins(db, tenant_id=caller.tenant_id) <= 1:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Cannot block the last active admin — promote another user first",
            )
    user = await deactivate_user(db, user_id, tenant_id=caller.tenant_id)
    return UserRead.model_validate(user)


@router.post("/{user_id}/reset-password", response_model=UserRead)
async def reset_password_endpoint(
    user_id: UUID,
    data: SetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    caller: User = Depends(require_role("admin")),
) -> UserRead:
    user = await get_user_by_id(db, user_id, tenant_id=caller.tenant_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    err = validate_password_strength(data.new_password, settings.password_min_length)
    if err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, err)
    user = await set_user_password(db, user, data.new_password)
    return UserRead.model_validate(user)
