# THE EYE

A tamper-evident monitoring, auditing, and accountability platform. THE EYE creates a
permanent, immutable record of who did what, when, where from, and what changed across
organizational systems — with fraud/risk detection, forensic tooling, multi-tenant RBAC,
and an AI-assisted investigation feature built on top.

This is a **standalone project**, unrelated to any other project on this machine.

---

## Architecture

Three components:

1. **Backend** (`backend/`) — FastAPI REST API with a hash-chained Postgres ledger,
   multi-tenant RBAC, per-user session auth, and optional AI investigation via Claude.
2. **Frontend** (`frontend/`) — Next.js dashboard. Pages: overview, events, timeline,
   analytics, alerts, alert rules, users at risk, access log, activity, intrusion detection,
   AI investigate, forensics, chain verifier, settings, whistleblower report, login.
3. **Agent** (`agent/`) — Go 1.24 Windows binary (`eye-agent.exe`). Collects Windows
   Event Log entries (Security/System/PowerShell), buffers them in a durable file-backed
   queue, and ships them to the backend. Runs in the system tray.

Scope is strictly **system events, not content**: logins, file access/mod/delete, permission
changes, process execution, config changes, financial transactions, admin actions, network
connections. Never keystrokes, screen captures, file contents, or messages — this is a hard
legal/compliance boundary enforced in request validation (`app/schemas/event.py`).

---

## Immutability — what's actually guaranteed

`ledger.events` is append-only:

- The application's runtime DB role (`eye_app`) only has `INSERT`/`SELECT` on
  `ledger.events` — no `UPDATE`/`DELETE` grant exists at all.
- `BEFORE UPDATE`/`BEFORE DELETE` triggers reject any mutation regardless of grants.
- Each record's hash chains from the previous record's hash (`app/ledger/hashing.py`),
  so any tampering that does land in storage is detectable by independently recomputing
  the chain (`scripts/verify_chain.py` or `GET /v1/chain/verify`).

**Honest limitation:** a true Postgres superuser can disable or drop the trigger and edit
rows directly. The grants/triggers stop the application layer and most insider threats,
but they are not proof against a compromised database superuser. External notarization
(`ledger.notarizations`, schema already present) is deferred to Phase 2/3 — the plan is
RFC 3161 / OpenTimestamps so stored hashes can be checked against an independent third party.

---

## Quickstart — Docker Compose (recommended)

Brings up Postgres, backend (with automatic migrations), and frontend in one command.

```sh
docker compose up --build
```

Then bootstrap your first tenant and admin user:

```sh
# Create a tenant (a business/organisation on the platform)
docker compose exec backend python -m scripts.create_tenant --name "Acme Corp" --slug acme

# Create a platform-admin user (no tenant, manages the platform itself)
docker compose exec backend python -m scripts.create_user \
  --username platform-admin --role platform_admin

# Create a tenant admin user
docker compose exec backend python -m scripts.create_user \
  --username admin --role admin --tenant-slug acme
```

Open **http://localhost:3000** and log in with the credentials you just set.

API docs (dev only): **http://localhost:8000/docs**

---

## Manual local development

### Prerequisites

- Python 3.11+
- Docker Desktop (for the Postgres container) — or a local Postgres 16 instance
- Node.js 18+

### Backend

```sh
cd backend
cp .env.example .env        # edit DATABASE_URL / ADMIN_DATABASE_URL if needed
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -e ".[dev]"

cd ..
docker compose up -d postgres
cd backend

alembic upgrade head        # creates schemas, roles, tables, triggers, grants

# Bootstrap a tenant and admin user
python -m scripts.create_tenant --name "Acme Corp" --slug acme
python -m scripts.create_user --username admin --role admin --tenant-slug acme

uvicorn app.main:app --reload   # http://localhost:8000
```

Optional dev data:

```sh
python -m scripts.create_ingestion_source --name dev-source --kind manual --tenant-slug acme
python -m scripts.seed_dev_events --count 200
python -m scripts.verify_chain      # expect: "OK: verified N records, chain intact"
```

Run tests:

```sh
pytest      # requires Postgres reachable; tests create/drop disposable DBs
```

### Frontend

```sh
cd frontend
cp .env.local.example .env.local    # set NEXT_PUBLIC_API_BASE_URL if needed
npm install
npm run dev                          # http://localhost:3000
```

Log in with the username and password you created via `scripts.create_user`.

---

## Verifying the ledger end-to-end

1. Create a source and copy the printed API key:
   ```sh
   python -m scripts.create_ingestion_source --name test --kind manual --tenant-slug acme
   ```

2. Ingest an event:
   ```sh
   curl -X POST http://localhost:8000/v1/events \
     -H "Authorization: Bearer <key>" \
     -H "Content-Type: application/json" \
     -d '{"occurred_at":"2026-06-28T12:00:00Z","actor_type":"user","actor_id":"alice",
          "event_type":"auth.login","event_category":"authentication","outcome":"success"}'
   ```
   Expect HTTP 201 with `sequence_num` and `record_hash`.

3. Verify the chain:
   ```sh
   python -m scripts.verify_chain
   ```
   Expect `chain intact`.

4. Tampering sanity check: connect with `psql` as `eye_admin` and run
   `UPDATE ledger.events SET outcome = 'success' WHERE sequence_num = 1;` — this
   should be rejected outright by the trigger. Re-running `verify_chain.py` after any
   successful out-of-band edit (e.g. via a superuser bypassing the trigger) reports the
   exact `sequence_num` where the chain breaks.

---

## Windows Agent

`agent/eye-agent.exe` is a pre-built binary. To deploy:

1. **Create a source** in the dashboard (Sources → New) or via CLI — choose kind `agent`.
   Copy the `eye_live_...` API key printed once at creation.

2. **Run the setup wizard** on the Windows machine to monitor:
   ```
   eye-agent.exe --setup
   ```
   Enter your backend URL, the API key, and a label for this machine.

3. **Install to Windows startup** (adds a registry Run key for the current user):
   ```
   eye-agent.exe --install
   ```

4. **Launch:**
   ```
   eye-agent.exe
   ```
   A blinking eye icon appears in the system tray. Right-click for status and a link
   to the dashboard.

To rebuild from source (requires Go 1.24, or use the bundled SDK at `%USERPROFILE%\go-sdk`):
```
agent\build.bat
```

Agent flags: `--setup` (wizard), `--install` (startup), `--uninstall`, `--version`.

---

## Roles

| Role | Scope |
|---|---|
| `platform_admin` | Manages tenants and platform-level settings. No tenant. |
| `admin` | Full access within their tenant. |
| `investigator` | Read-only forensics and investigation within their tenant. |
| `chief_auditor` / `compliance_officer` / `security_officer` / `executive_authority` | Tenant-scoped read roles with varying access. |

---

## Deployment

**Backend** — deployable to Railway (`railway.json`) or AWS App Runner (`apprunner.yaml`).
Set `DATABASE_URL`, `ADMIN_DATABASE_URL`, `ENV=production`, and `CORS_ALLOWED_ORIGINS`
in your host's environment config. Run `alembic upgrade head` as a deploy step before
starting the server.

**Frontend** — deployable to Vercel (`vercel.json`). Set `NEXT_PUBLIC_API_BASE_URL` to
your backend's public URL.

**Agent** — distribute `eye-agent.exe` to Windows machines you want to monitor. Each
machine needs its own source/API key created in the platform first.
