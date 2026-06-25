from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role
from app.schemas.intrusion import IntrusionStats
from app.services.intrusion_service import get_intrusion_stats

router = APIRouter(prefix="/v1/intrusion", tags=["intrusion"], dependencies=[Depends(require_role("admin", "investigator"))])


@router.get("/stats", response_model=IntrusionStats)
async def intrusion_stats(db: AsyncSession = Depends(get_db)) -> IntrusionStats:
    stats = await get_intrusion_stats(db)
    return IntrusionStats(**stats)
