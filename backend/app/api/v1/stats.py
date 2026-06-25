from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role, require_tenant_id
from app.schemas.stats import ActorRiskScore, OverviewStats
from app.services.stats_service import (
    get_actor_risk_scores,
    get_activity_heatmap,
    get_analytics,
    get_chain_summary,
    get_overview_stats,
)

router = APIRouter(prefix="/v1", tags=["stats"], dependencies=[Depends(require_role("admin", "investigator", "platform_admin"))])


@router.get("/stats/overview", response_model=OverviewStats)
async def overview_stats(
    db: AsyncSession = Depends(get_db), tenant_id: UUID = Depends(require_tenant_id)
) -> OverviewStats:
    stats = await get_overview_stats(db, tenant_id=tenant_id)
    return OverviewStats(**stats)


@router.get("/risk/actors", response_model=list[ActorRiskScore])
async def risk_actors(
    db: AsyncSession = Depends(get_db), tenant_id: UUID = Depends(require_tenant_id)
) -> list[ActorRiskScore]:
    scores = await get_actor_risk_scores(db, tenant_id=tenant_id)
    return [ActorRiskScore(**s) for s in scores]


@router.get("/stats/analytics")
async def analytics(db: AsyncSession = Depends(get_db), tenant_id: UUID = Depends(require_tenant_id)) -> dict:
    return await get_analytics(db, tenant_id=tenant_id)


@router.get("/stats/heatmap")
async def activity_heatmap(db: AsyncSession = Depends(get_db), tenant_id: UUID = Depends(require_tenant_id)) -> list:
    return await get_activity_heatmap(db, tenant_id=tenant_id)


@router.get("/chain/summary")
async def chain_summary(db: AsyncSession = Depends(get_db)) -> dict:
    return await get_chain_summary(db)
