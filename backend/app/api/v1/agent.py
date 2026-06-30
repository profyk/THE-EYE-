"""THE EYE Agent API.

Machine agents authenticate with X-Tenant-ID + X-Api-Key headers.
All endpoints here bypass session-cookie auth and use API key auth instead.
"""
import hashlib
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.api_key import ApiKey
from app.models.tenant import Tenant

router = APIRouter(prefix="/v1/agent", tags=["agent"])


async def _resolve_tenant(
    x_tenant_id: str | None,
    x_api_key: str | None,
    db: AsyncSession,
) -> Tenant:
    if not x_tenant_id or not x_api_key:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Missing X-Tenant-ID or X-Api-Key headers.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    try:
        tid = uuid.UUID(x_tenant_id)
    except ValueError:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid X-Tenant-ID format (must be UUID)."
        )

    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == tid))
    ).scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Tenant not found or inactive."
        )

    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
    key = (
        await db.execute(
            select(ApiKey).where(
                ApiKey.key_hash == key_hash,
                ApiKey.tenant_id == tid,
                ApiKey.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()

    if key is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid or revoked API key."
        )

    if key.expires_at and key.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "API key has expired.")

    await db.execute(
        text("UPDATE app.api_keys SET last_used_at = NOW() WHERE id = :id"),
        {"id": key.id},
    )
    await db.commit()

    return tenant


class AgentVerifyResponse(BaseModel):
    ok: bool
    tenant_id: str
    tenant_name: str
    tenant_slug: str


@router.get("/verify", response_model=AgentVerifyResponse)
async def agent_verify(
    x_tenant_id: str | None = Header(default=None, alias="X-Tenant-ID"),
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
    db: AsyncSession = Depends(get_db),
) -> AgentVerifyResponse:
    """Called by the agent on startup to validate credentials before running."""
    tenant = await _resolve_tenant(x_tenant_id, x_api_key, db)
    return AgentVerifyResponse(
        ok=True,
        tenant_id=str(tenant.id),
        tenant_name=tenant.name,
        tenant_slug=tenant.slug,
    )
