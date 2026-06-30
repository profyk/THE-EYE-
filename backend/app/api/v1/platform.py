from fastapi import APIRouter, Depends

from app.api.deps import require_role
from app.config import settings

router = APIRouter(
    prefix="/v1/platform",
    tags=["platform"],
    dependencies=[Depends(require_role("admin", "investigator", "super_admin"))],
)


@router.get("/info")
async def platform_info() -> dict:
    return {
        "version": "0.1.0",
        "env": settings.env,
        "ai_configured": bool(settings.anthropic_api_key),
        "anthropic_model": settings.anthropic_model if settings.anthropic_api_key else None,
        "session_ttl_hours": settings.session_token_ttl_hours,
        "max_batch_size": settings.max_batch_size,
        "max_backdate_days": settings.max_backdate_days,
        "cors_origins": settings.cors_allowed_origins_list,
    }
