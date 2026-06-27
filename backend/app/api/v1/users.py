from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role
from app.models.user import User
from app.schemas.user import SetPasswordRequest, UserCreate, UserRead
from app.services.user_service import (
    create_user,
    deactivate_user,
    get_user_by_id,
    get_user_by_username,
    list_users,
    set_user_password,
)

router = APIRouter(prefix="/v1/users", tags=["users"], dependencies=[Depends(require_role("admin"))])


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user_endpoint(
    data: UserCreate, db: AsyncSession = Depends(get_db), caller: User = Depends(require_role("admin"))
) -> UserRead:
    if await get_user_by_username(db, data.username) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    # Always the caller's own tenant -- never trust a tenant_id in the
    # request body here, or one tenant's admin could create users inside a
    # different tenant by just passing an arbitrary id.
    data = data.model_copy(update={"tenant_id": caller.tenant_id})
    user = await create_user(db, data)
    return UserRead.model_validate(user)


@router.get("", response_model=list[UserRead])
async def list_users_endpoint(
    db: AsyncSession = Depends(get_db), caller: User = Depends(require_role("admin"))
) -> list[UserRead]:
    users = await list_users(db, tenant_id=caller.tenant_id)
    return [UserRead.model_validate(u) for u in users]


@router.post("/{user_id}/deactivate", response_model=UserRead)
async def deactivate_user_endpoint(
    user_id: UUID, db: AsyncSession = Depends(get_db), caller: User = Depends(require_role("admin"))
) -> UserRead:
    user = await deactivate_user(db, user_id, tenant_id=caller.tenant_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
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
    user = await set_user_password(db, user, data.new_password)
    return UserRead.model_validate(user)
