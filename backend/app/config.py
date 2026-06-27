from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    admin_database_url: str = ""
    env: str = "development"
    cors_allowed_origins: str = "http://localhost:3000"

    @property
    def cors_allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]

    # SQLAlchemy's unconfigured defaults (pool_size=5, max_overflow=10,
    # pool_timeout=30s) are too small for "many concurrent users" and too
    # patient about it -- a burst just queues silently for 30s before failing.
    # These give a larger, explicit ceiling and fail fast instead.
    db_pool_size: int = 20
    db_max_overflow: int = 20
    db_pool_timeout_seconds: int = 10

    # Ingestion validation limits
    max_metadata_bytes: int = 8192
    max_batch_size: int = 500
    max_future_skew_minutes: int = 5
    max_backdate_days: int = 7
    # Generous enough for a full max_batch_size batch with max_metadata_bytes
    # per event, but bounded -- rejected before parsing, not after buffering.
    max_request_body_bytes: int = 5_000_000

    # Real user accounts (Phase 2A) -- replaces the old single shared
    # ADMIN_AUTH_TOKEN entirely.
    session_token_ttl_hours: int = 24

    @property
    def cookie_secure(self) -> bool:
        return self.env != "development"

    # AI investigate feature (Phase 2E) -- optional. Empty means the feature
    # returns a clear "not configured" error rather than failing unexpectedly.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # Security hardening knobs. Sane production defaults; override in .env.
    # Minimum password length enforced on create and reset -- 12 is NIST SP
    # 800-63B's recommended floor for subscriber-chosen memorized secrets.
    password_min_length: int = 12
    # Global per-IP request cap applied to every API route. This is a
    # last-resort DoS backstop, not a primary rate limit -- auth endpoints
    # have tighter per-endpoint limits applied first.
    global_rate_limit_per_ip: int = 300
    global_rate_limit_window_seconds: int = 60
    # Whether to trust X-Forwarded-For / CF-Connecting-IP headers. Set to
    # False when not behind any proxy (direct-to-internet deployments) to
    # prevent IP spoofing that defeats IP-keyed rate limits.
    trust_proxy_headers: bool = True


settings = Settings()
