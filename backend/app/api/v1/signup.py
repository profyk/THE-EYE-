"""Public self-serve signup endpoint.

Creates a pending (is_active=False) tenant and its first admin user.
The tenant stays inactive until Paddle fires subscription.activated,
at which point the webhook handler flips is_active=True and the user
can log in.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import settings
from app.core.rate_limit import check_rate_limit
from app.core.request_utils import get_client_ip
from app.core.security import validate_password_strength
from app.schemas.tenant import TenantCreate
from app.schemas.user import UserCreate
from app.services.tenant_service import create_tenant, get_tenant_by_slug
from app.services.user_service import create_user, get_user_by_username

router = APIRouter(prefix="/v1/auth", tags=["auth"])

SIGNUP_RATE_LIMIT_MAX = 5
SIGNUP_RATE_LIMIT_WINDOW = 3600  # 5 signups per IP per hour


class SignupRequest(BaseModel):
    tenant_name: str = Field(min_length=1, max_length=255)
    tenant_slug: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9-]+$")
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=12, max_length=256)


class SignupResponse(BaseModel):
    tenant_id: str


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    data: SignupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> SignupResponse:
    client_ip = get_client_ip(request, trust_proxy=settings.trust_proxy_headers)
    if not check_rate_limit(
        f"signup:{client_ip or 'unknown'}",
        max_requests=SIGNUP_RATE_LIMIT_MAX,
        window_seconds=SIGNUP_RATE_LIMIT_WINDOW,
    ):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many signup attempts — try again later.")

    err = validate_password_strength(data.password, settings.password_min_length)
    if err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, err)

    if await get_tenant_by_slug(db, data.tenant_slug) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Organisation slug is already taken.")

    if await get_user_by_username(db, data.username) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username is already taken.")

    # Create tenant in pending state — Paddle webhook activates it after payment.
    tenant = await create_tenant(
        db, TenantCreate(name=data.tenant_name, slug=data.tenant_slug), is_active=False
    )
    await create_user(
        db,
        UserCreate(username=data.username, password=data.password, role="admin", tenant_id=tenant.id),
    )

    return SignupResponse(tenant_id=str(tenant.id))
