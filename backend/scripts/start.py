"""Railway startup orchestration — prints every step so crashes are visible in logs."""
import os
import subprocess
import sys


def _run(cmd: list[str], *, fatal: bool = True) -> int:
    print(f"\n[START] >> {' '.join(cmd)}", flush=True)
    result = subprocess.run(cmd)
    print(f"[START] << exit {result.returncode}", flush=True)
    if fatal and result.returncode != 0:
        print(f"[START] FATAL: command failed — see output above", flush=True)
        sys.exit(result.returncode)
    return result.returncode


if __name__ == "__main__":
    # ── Environment diagnostics ──────────────────────────────────────────────
    db_url = os.environ.get("DATABASE_URL", "")
    scheme = db_url.split("://")[0] if "://" in db_url else "NOT SET"
    port = os.environ.get("PORT", "NOT SET")
    print(f"[START] DATABASE_URL scheme : {scheme}", flush=True)
    print(f"[START] PORT                : {port}", flush=True)

    if not db_url:
        print("[START] FATAL: DATABASE_URL is not set in Railway env vars!", flush=True)
        sys.exit(1)

    # ── Import smoke test ────────────────────────────────────────────────────
    # Run in a subprocess so the traceback appears in the logs before we exit.
    print("\n[START] Testing app.main import...", flush=True)
    import_check = subprocess.run(
        [sys.executable, "-c", "import app.main; print('[START] app.main import OK')"]
    )
    if import_check.returncode != 0:
        print("[START] FATAL: app.main failed to import. Traceback above.", flush=True)
        sys.exit(import_check.returncode)

    # ── Migrations ───────────────────────────────────────────────────────────
    _run(["alembic", "upgrade", "head"], fatal=True)

    # ── Bootstrap ────────────────────────────────────────────────────────────
    _run([sys.executable, "-m", "scripts.bootstrap"], fatal=False)

    # ── Uvicorn ─────────────────────────────────────────────────────────────
    port = os.environ.get("PORT", "8000")
    print(f"\n[START] Starting uvicorn on :{port}", flush=True)
    os.execvp(
        "uvicorn",
        ["uvicorn", "app.main:app", "--host", "0.0.0.0", f"--port={port}"],
    )
