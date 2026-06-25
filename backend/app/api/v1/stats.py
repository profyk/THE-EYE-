from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role
from app.schemas.stats import ActorRiskScore, OverviewStats
from app.services.stats_service import get_actor_risk_scores, get_overview_stats

router = APIRouter(prefix="/v1", tags=["stats"], dependencies=[Depends(require_role("admin", "investigator"))])


@router.get("/stats/overview", response_model=OverviewStats)
async def overview_stats(db: AsyncSession = Depends(get_db)) -> OverviewStats:
    stats = await get_overview_stats(db)
    return OverviewStats(**stats)


@router.get("/risk/actors", response_model=list[ActorRiskScore])
async def risk_actors(db: AsyncSession = Depends(get_db)) -> list[ActorRiskScore]:
    scores = await get_actor_risk_scores(db)
    return [ActorRiskScore(**s) for s in scores]
