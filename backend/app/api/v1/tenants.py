from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role
from app.schemas.tenant import TenantCreate, TenantRead
from app.services.tenant_service import create_tenant, get_tenant_by_slug, list_tenants

# super_admin only -- this is THE EYE's own staff managing customer
# tenants, not anything a business owner ever sees. No frontend panel for
# this yet (a later phase); for now super_admin uses this API directly or
# scripts/create_tenant.py.
router = APIRouter(prefix="/v1/tenants", tags=["tenants"], dependencies=[Depends(require_role("super_admin"))])


@router.post("", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
async def create_tenant_endpoint(data: TenantCreate, db: AsyncSession = Depends(get_db)) -> TenantRead:
    if await get_tenant_by_slug(db, data.slug) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already exists")
    tenant = await create_tenant(db, data)
    return TenantRead.model_validate(tenant)


@router.get("", response_model=list[TenantRead])
async def list_tenants_endpoint(db: AsyncSession = Depends(get_db)) -> list[TenantRead]:
    tenants = await list_tenants(db)
    return [TenantRead.model_validate(t) for t in tenants]
