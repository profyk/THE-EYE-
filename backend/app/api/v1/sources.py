from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role
from app.models.user import User
from app.schemas.source import SourceCreate, SourceCreated, SourceRead
from app.services.source_service import create_source, deactivate_source, list_sources

router = APIRouter(prefix="/v1/sources", tags=["sources"], dependencies=[Depends(require_role("admin"))])


@router.post("", response_model=SourceCreated, status_code=status.HTTP_201_CREATED)
async def create_ingestion_source(
    data: SourceCreate, db: AsyncSession = Depends(get_db), caller: User = Depends(require_role("admin"))
) -> SourceCreated:
    """Returns the plaintext API key exactly once -- it is never stored or
    retrievable again after this response."""
    return await create_source(db, data, tenant_id=caller.tenant_id)


@router.get("", response_model=list[SourceRead])
async def list_ingestion_sources(
    db: AsyncSession = Depends(get_db), caller: User = Depends(require_role("admin"))
) -> list[SourceRead]:
    sources = await list_sources(db, tenant_id=caller.tenant_id)
    return [SourceRead.model_validate(s) for s in sources]


@router.post("/{source_id}/deactivate", response_model=SourceRead)
async def deactivate_ingestion_source(
    source_id: UUID, db: AsyncSession = Depends(get_db), caller: User = Depends(require_role("admin"))
) -> SourceRead:
    source = await deactivate_source(db, source_id, tenant_id=caller.tenant_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    return SourceRead.model_validate(source)
