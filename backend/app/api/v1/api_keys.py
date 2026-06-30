"""Tenant API key management.

Tenant admins generate keys here; the keys are used by THE EYE Agent
to authenticate machine-level event submissions.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.api_key import ApiKey
from app.models.user import User

router = APIRouter(prefix="/v1/api-keys", tags=["api-keys"])


def _generate_key() -> tuple[str, str, str]:
    """Return (full_key, display_prefix, sha256_hash)."""
    raw = secrets.token_urlsafe(32)
    full_key = f"eye_{raw}"
    display_prefix = full_key[:12]
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    return full_key, display_prefix, key_hash


def _require_tenant_scope(current_user: User) -> None:
    if current_user.role == "super_admin":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "super_admin users are not tenant-scoped."
        )
    if not current_user.tenant_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "No tenant associated with your account."
        )


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    expires_at: datetime | None = None


class ApiKeyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    is_active: bool | None = None


class ApiKeyOut(BaseModel):
    id: uuid.UUID
    name: str
    key_prefix: str
    is_active: bool
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
    created_by_username: str | None

    model_config = {"from_attributes": True}


class ApiKeyCreated(ApiKeyOut):
    full_key: str  # shown once only


@router.get("", response_model=list[ApiKeyOut])
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ApiKeyOut]:
    _require_tenant_scope(current_user)
    rows = list(
        (
            await db.execute(
                select(ApiKey)
                .where(ApiKey.tenant_id == current_user.tenant_id)
                .order_by(ApiKey.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [
        ApiKeyOut(
            id=k.id,
            name=k.name,
            key_prefix=k.key_prefix,
            is_active=k.is_active,
            last_used_at=k.last_used_at,
            expires_at=k.expires_at,
            created_at=k.created_at,
            created_by_username=k.creator.username if k.creator else None,
        )
        for k in rows
    ]


@router.post("", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    data: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiKeyCreated:
    _require_tenant_scope(current_user)

    count = len(
        list(
            (
                await db.execute(
                    select(ApiKey).where(ApiKey.tenant_id == current_user.tenant_id)
                )
            )
            .scalars()
            .all()
        )
    )
    if count >= 20:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Maximum of 20 API keys per tenant."
        )

    full_key, display_prefix, key_hash = _generate_key()
    key = ApiKey(
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
        name=data.name,
        key_prefix=display_prefix,
        key_hash=key_hash,
        expires_at=data.expires_at,
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)

    return ApiKeyCreated(
        id=key.id,
        name=key.name,
        key_prefix=key.key_prefix,
        is_active=key.is_active,
        last_used_at=key.last_used_at,
        expires_at=key.expires_at,
        created_at=key.created_at,
        created_by_username=current_user.username,
        full_key=full_key,
    )


@router.patch("/{key_id}", response_model=ApiKeyOut)
async def update_api_key(
    key_id: uuid.UUID,
    data: ApiKeyUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiKeyOut:
    _require_tenant_scope(current_user)
    key = (
        await db.execute(
            select(ApiKey).where(
                ApiKey.id == key_id,
                ApiKey.tenant_id == current_user.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API key not found.")
    if data.name is not None:
        key.name = data.name
    if data.is_active is not None:
        key.is_active = data.is_active
    await db.commit()
    await db.refresh(key)
    return ApiKeyOut(
        id=key.id,
        name=key.name,
        key_prefix=key.key_prefix,
        is_active=key.is_active,
        last_used_at=key.last_used_at,
        expires_at=key.expires_at,
        created_at=key.created_at,
        created_by_username=key.creator.username if key.creator else None,
    )


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_tenant_scope(current_user)
    key = (
        await db.execute(
            select(ApiKey).where(
                ApiKey.id == key_id,
                ApiKey.tenant_id == current_user.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API key not found.")
    await db.delete(key)
    await db.commit()
