from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role, require_tenant_id
from app.ledger.verify import verify_chain
from app.services.network_service import get_actor_target_network

router = APIRouter(prefix="/v1", tags=["forensics"], dependencies=[Depends(require_role("admin", "investigator", "platform_admin"))])


@router.get("/chain/verify")
async def chain_verify(db: AsyncSession = Depends(get_db)) -> dict:
    """Exposes the same verification logic scripts/verify_chain.py uses, as an
    on-demand dashboard action -- chain-of-custody verification without
    needing shell access."""
    report = await verify_chain(db)
    return {
        "ok": report.ok,
        "records_checked": report.records_checked,
        "divergences": [
            {"sequence_num": d.sequence_num, "field": d.field, "expected": d.expected, "actual": d.actual}
            for d in report.divergences
        ],
    }


@router.get("/forensics/network")
async def forensics_network(
    db: AsyncSession = Depends(get_db), tenant_id: UUID = Depends(require_tenant_id)
) -> dict:
    return await get_actor_target_network(db, tenant_id=tenant_id)
