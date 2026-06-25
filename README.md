# THE EYE

A tamper-proof monitoring, auditing, and accountability platform. THE EYE creates a
permanent, immutable record of who did what, when, where from, and what changed
across organizational systems, with fraud/risk detection and forensic tooling
planned on top.

This is a **standalone project**, unrelated to any other project on this machine.

## Architecture

Two pieces, long-term:

1. **Agent (collector)** — a future minimal per-OS binary with no business logic
   that just ships observed system events to the platform. **Not built yet.**
2. **Core Platform** (this repo, Phase 1) — ingestion API, immutable hash-chained
   ledger, and a dashboard. Never runs on end-user machines. Accepts events from
   non-agent sources (DB triggers, API hooks, log forwarders) today, and is
   designed so the future Agent is just another source hitting the same
   ingestion endpoint — no interface change needed later.

Scope is strictly **system events, not content**: logins, file access/mod/delete,
permission changes, process execution, config changes, financial transactions,
admin actions, network connections. Never keystrokes, screen captures, file
contents, or messages — this is a hard legal/compliance boundary enforced in
request validation (see `app/schemas/event.py`), not just policy.

## Immutability — what's actually guaranteed

`ledger.events` is append-only:

- The application's runtime DB role (`eye_app`) only has `INSERT`/`SELECT` on
  `ledger.events` — no `UPDATE`/`DELETE` grant exists at all.
- `BEFORE UPDATE`/`BEFORE DELETE` triggers reject any mutation regardless of
  grants, as defense-in-depth.
- Each record's hash chains from the previous record's hash
  (`app/ledger/hashing.py`), so any tampering that *does* land in storage is
  detectable by independently recomputing the chain (`scripts/verify_chain.py`).

**Honest limitation:** a true Postgres superuser can disable or drop the
trigger and edit rows directly. The grants/triggers stop the application layer
and most insider threats, but they are not proof against a compromised
database superuser. That's what external notarization (`ledger.notarizations`,
schema only for now) is *for* — Phase 2/3 adds real RFC 3161/OpenTimestamps
integration so a stored hash can be checked against an independent third party.
Don't oversell this as cryptographically tamper-*proof* against every actor;
it's tamper-*evident* against everyone except a rogue DB superuser today.

## Phase 1 scope (this build)

Built: ingestion API (`POST /v1/events`, `/v1/events/batch`), event search/detail
(`GET /v1/events`, `/v1/events/{id}`), hash-chained ledger + verification script,
minimal admin source management, a single shared admin-token gate, and a Next.js
dashboard (event list/filters, detail view, timeline).

Deferred to later phases: risk/fraud/anomaly detection, real-time alerting, full
RBAC, multi-party deletion approval, real external notarization, multi-tenant
UI, and the Agent binary itself. The schema already has `tenant_id` on every
ledger row and a `notarizations` table so none of these need a future schema
migration to bolt on.

## Local development

### Prerequisites

This machine did not have Python, pip, or Docker installed when this project was
scaffolded — only Node.js/npm. Before running the backend you need:

- **Python 3.11+** with `pip`
- **Docker Desktop** (for the Postgres container) — or a local Postgres 16 instance
- **Node.js** (already present) for the frontend

### Backend

```sh
cd backend
cp .env.example .env          # edit ADMIN_AUTH_TOKEN before any non-local use
python -m venv .venv
.venv\Scripts\activate         # Windows
pip install -e ".[dev]"

cd ..
docker compose up -d postgres
cd backend
alembic upgrade head            # creates schemas, roles, tables, triggers, grants

python -m scripts.create_ingestion_source --name "dev-source" --kind manual
python -m scripts.seed_dev_events --count 200
python -m scripts.verify_chain      # expect: "OK: verified N records, chain intact"

pytest                          # requires Postgres reachable; tests create/drop disposable DBs

uvicorn app.main:app --reload   # http://localhost:8000
```

### Frontend

```sh
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                      # http://localhost:3000
```

Log in with the `ADMIN_AUTH_TOKEN` value from `backend/.env` as the password.

### Verifying the ledger end-to-end

1. `python -m scripts.create_ingestion_source --name test --kind manual` → copy the printed API key.
2. `curl -X POST http://localhost:8000/v1/events -H "Authorization: Bearer <key>" -H "Content-Type: application/json" -d '{"occurred_at":"2026-06-18T12:00:00Z","actor_type":"user","actor_id":"alice","event_type":"auth.login","event_category":"authentication","outcome":"success"}'`
   → expect HTTP 201 with `sequence_num` and `record_hash`.
3. `python -m scripts.verify_chain` → expect `chain intact`.
4. As a sanity check that tampering is actually detected, connect with `psql` as
   the `eye_admin` role and run
   `UPDATE ledger.events SET outcome = 'success' WHERE sequence_num = 1;` —
   this should fail outright (append-only trigger). Re-running
   `verify_chain.py` after any successful out-of-band edit (e.g. via a
   superuser bypassing the trigger) should report the exact `sequence_num`
   where the chain breaks.
