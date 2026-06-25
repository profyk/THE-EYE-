"""Test database fixture: each test gets a fresh, fully-migrated Postgres
database, dropped afterward. ledger.events is append-only by design (UPDATE and
DELETE are blocked even for cleanup), so transaction-rollback-based isolation
doesn't fit here -- a disposable database per test is the simplest correct
strategy. Slower than rollback isolation, but the suite is small.

This fixture is intentionally a plain (sync) fixture, not an async one: Alembic's
migrations/env.py calls asyncio.run() internally, which raises if a loop is
already running. Keeping provisioning here in sync code (using asyncio.run()
for the brief async calls) means it all happens before pytest-asyncio starts the
event loop for the test coroutine itself, avoiding a nested-loop conflict.

Requires a reachable Postgres matching docker-compose.yml's eye_admin/eye_app
defaults (run `docker compose up -d postgres` first). Tests skip automatically
if Postgres isn't reachable.
"""
import asyncio
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

import asyncpg
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool


@dataclass
class TestDatabase:
    session_factory: async_sessionmaker
    admin_engine: AsyncEngine


BACKEND_DIR = Path(__file__).resolve().parent.parent
MAINTENANCE_DSN = os.environ.get(
    "TEST_MAINTENANCE_DSN", "postgresql://eye_admin:devpassword@localhost:5432/postgres"
)


def _admin_url(db_name: str) -> str:
    return f"postgresql+asyncpg://eye_admin:devpassword@localhost:5432/{db_name}"


def _app_url(db_name: str) -> str:
    return f"postgresql+asyncpg://eye_app:eye_app_devpassword@localhost:5432/{db_name}"


async def _create_database(db_name: str) -> None:
    conn = await asyncpg.connect(MAINTENANCE_DSN)
    try:
        await conn.execute(f'CREATE DATABASE "{db_name}"')
    finally:
        await conn.close()


async def _drop_database(db_name: str) -> None:
    conn = await asyncpg.connect(MAINTENANCE_DSN)
    try:
        await conn.execute(f'DROP DATABASE "{db_name}" WITH (FORCE)')
    finally:
        await conn.close()


@pytest.fixture
def test_db():
    async def _probe() -> bool:
        try:
            conn = await asyncpg.connect(MAINTENANCE_DSN, timeout=2)
            await conn.close()
            return True
        except (OSError, asyncpg.PostgresError):
            return False

    if not asyncio.run(_probe()):
        pytest.skip("Postgres not reachable -- run `docker compose up -d postgres` first")

    db_name = f"the_eye_test_{uuid.uuid4().hex[:8]}"
    asyncio.run(_create_database(db_name))

    admin_url = _admin_url(db_name)
    app_url = _app_url(db_name)
    os.environ["ADMIN_DATABASE_URL"] = admin_url
    os.environ["DATABASE_URL"] = app_url

    alembic_cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    command.upgrade(alembic_cfg, "head")

    # NullPool: don't keep pooled connections alive across calls. Tests mix
    # asyncio.run() (own throwaway loop), pytest-asyncio's loop, and TestClient's
    # internal worker-thread loop -- a pooled asyncpg connection created under
    # one loop can't be reused from another ("attached to a different loop").
    # NullPool opens a fresh connection per checkout, so each is bound to
    # whichever loop is actually live at the time.
    engine = create_async_engine(app_url, poolclass=NullPool)
    admin_engine = create_async_engine(admin_url, poolclass=NullPool)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    yield TestDatabase(session_factory=session_factory, admin_engine=admin_engine)

    async def _teardown_engines() -> None:
        await engine.dispose()
        await admin_engine.dispose()

    asyncio.run(_teardown_engines())
    asyncio.run(_drop_database(db_name))


async def create_test_user(test_db: TestDatabase, *, username: str, password: str, role: str):
    """Helper for tests that need a real user account (Phase 2A replaced the
    old single shared admin token with real per-user login)."""
    from app.schemas.user import UserCreate
    from app.services.user_service import create_user

    async with test_db.session_factory() as db:
        return await create_user(db, UserCreate(username=username, password=password, role=role))


async def create_test_session_token(test_db: TestDatabase, user) -> str:
    from app.services.user_service import create_session

    async with test_db.session_factory() as db:
        return await create_session(db, user)
