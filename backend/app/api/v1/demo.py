from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role, require_tenant_id
from app.services.demo_seed import run_demo_seed

router = APIRouter(prefix="/v1", tags=["demo"])


@router.post(
    "/demo/seed",
    dependencies=[Depends(require_role("admin", "super_admin"))],
    summary="Seed demo data for the current tenant",
)
async def seed_demo(
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(require_tenant_id),
) -> dict:
    return await run_demo_seed(db, tenant_id=tenant_id)
