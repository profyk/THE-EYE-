from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import (
    alerts,
    auth,
    deletion_requests,
    events,
    forensics,
    intrusion,
    investigate,
    platform,
    sources,
    stats,
    tenants,
    users,
    whistleblower,
)
from app.config import settings
from app.core.body_limit import MaxBodySizeMiddleware
from app.core.errors import validation_exception_handler
from app.core.rate_limit import check_rate_limit
from app.core.request_utils import get_client_ip

app = FastAPI(
    title="THE EYE",
    version="0.1.0",
    # Never expose internal routes in the OpenAPI schema in production.
    # Docs are still accessible in development (env != "production").
    docs_url="/docs" if settings.env != "production" else None,
    redoc_url="/redoc" if settings.env != "production" else None,
    openapi_url="/openapi.json" if settings.env != "production" else None,
)

# Starlette's add_middleware prepends to the stack, so the LAST one added
# runs FIRST on the way in (and last on the way out) -- MaxBodySizeMiddleware
# is added last so an oversized request gets rejected before CORS or anything
# else downstream spends any effort on it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(MaxBodySizeMiddleware, max_body_size=settings.max_request_body_bytes)


@app.middleware("http")
async def global_rate_limit(request: Request, call_next) -> Response:
    """Last-resort DoS backstop: 300 req/60s per IP across all routes.
    Per-endpoint limits on login, ingestion-failure logging, and whistleblower
    are tighter and applied first; this catches everything else."""
    # Healthz is exempt -- load balancers hit it constantly.
    if request.url.path == "/healthz":
        return await call_next(request)
    ip = get_client_ip(request, trust_proxy=settings.trust_proxy_headers) or "unknown"
    allowed = check_rate_limit(
        f"global:{ip}",
        max_requests=settings.global_rate_limit_per_ip,
        window_seconds=settings.global_rate_limit_window_seconds,
    )
    if not allowed:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Too many requests"},
        )
    return await call_next(request)


@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Opt out of all browser features the dashboard never uses.
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), "
        "interest-cohort=()"
    )
    # Prevent the browser from sharing a browsing context group with
    # cross-origin pages (closes Spectre side-channel vectors).
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    # Prevent cross-origin pages from loading our resources directly.
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    if settings.env != "development":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


async def _generic_500_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unhandled exceptions. FastAPI's default 500 response
    includes the exception repr in development and a bare 'Internal Server
    Error' in production -- neither is ideal. This always returns a stable
    JSON shape and never leaks the exception class or message."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal error occurred. Please try again later."},
    )


app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, _generic_500_handler)

app.include_router(events.router)
app.include_router(sources.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(stats.router)
app.include_router(alerts.router)
app.include_router(forensics.router)
app.include_router(deletion_requests.router)
app.include_router(investigate.router)
app.include_router(whistleblower.router)
app.include_router(intrusion.router)
app.include_router(tenants.router)
app.include_router(platform.router)


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}
