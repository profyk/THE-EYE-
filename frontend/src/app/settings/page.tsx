"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import StatusBadge from "@/components/StatusBadge";
import Button from "@/components/Button";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getSession } from "@/lib/auth";
import {
  getPlatformInfo, getChainSummary, getOverviewStats,
  listUsers, createUser, deactivateUser,
  ApiError, PlatformInfo, ChainSummary, OverviewStats, UserRead,
} from "@/lib/api-client";

const ROLES = [
  "admin",
  "investigator",
  "chief_auditor",
  "compliance_officer",
  "security_officer",
  "executive_authority",
];

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm font-semibold ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function UserManagementPanel() {
  const [users, setUsers] = useState<UserRead[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("admin");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const load = () =>
    listUsers()
      .then(setUsers)
      .catch((e: ApiError) => setLoadErr(e.message || "Failed to load users"));

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    setSaving(true);
    try {
      await createUser(username, password, role);
      setUsername(""); setPassword(""); setRole("admin");
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    setDeactivating(id);
    try {
      await deactivateUser(id);
      await load();
    } finally {
      setDeactivating(null);
    }
  }

  return (
    <Panel className="px-5">
      <div className="flex items-center justify-between pt-4 pb-2">
        <p className="text-xs font-bold tracking-wide text-muted uppercase">Users</p>
        {!showForm && (
          <Button variant="outline" tone="accent" className="text-xs py-1 px-3" onClick={() => setShowForm(true)}>
            + New User
          </Button>
        )}
      </div>

      {loadErr && <p className="text-sm text-danger pb-3">{loadErr}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 space-y-3 border border-border rounded-lg p-4">
          <p className="text-sm font-semibold">Create User</p>
          {formErr && <p className="text-xs text-danger">{formErr}</p>}
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="col-span-2 bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
            <div className="col-span-2 relative">
              <input
                required
                type={showPassword ? "text" : "password"}
                placeholder="Password (12+ chars)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="col-span-2 bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
            <Button type="button" variant="ghost" tone="muted" onClick={() => { setShowForm(false); setFormErr(null); }}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="divide-y divide-border pb-2">
        {users.length === 0 && !loadErr && (
          <p className="text-sm text-muted py-3">No users yet.</p>
        )}
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm font-semibold">{u.username}</p>
                <p className="text-xs text-muted">{u.role}</p>
              </div>
              {!u.is_active && <StatusBadge tone="muted">Inactive</StatusBadge>}
            </div>
            {u.is_active && (
              <Button
                variant="ghost"
                tone="danger"
                className="text-xs py-1 px-2"
                disabled={deactivating === u.id}
                onClick={() => handleDeactivate(u.id)}
              >
                {deactivating === u.id ? "…" : "Deactivate"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function SettingsPage() {
  const ready = useRequireAuth();
  const session = getSession();
  const [info, setInfo] = useState<PlatformInfo | null>(null);
  const [chain, setChain] = useState<ChainSummary | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    Promise.all([getPlatformInfo(), getChainSummary(), getOverviewStats()])
      .then(([i, c, s]) => { setInfo(i); setChain(c); setStats(s); })
      .catch((e: ApiError) => setError(e.message || "Failed to load platform info"));
  }, [ready]);

  if (!ready) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="p-6 flex-1 max-w-2xl space-y-6">
        <h1 className="text-lg font-semibold">Settings</h1>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Panel className="px-5">
          <p className="text-xs font-bold tracking-wide text-muted uppercase pt-4 pb-2">Platform</p>
          {info && (
            <>
              <Row label="Version" value={info.version} mono />
              <Row
                label="Environment"
                value={
                  <StatusBadge tone={info.env === "production" ? "safe" : "warn"}>
                    {info.env}
                  </StatusBadge>
                }
              />
              <Row label="API base URL" value={apiBase} mono />
              <Row label="Session TTL" value={`${info.session_ttl_hours}h`} />
              <Row label="Max batch size" value={info.max_batch_size.toLocaleString()} />
              <Row label="Max backdate" value={`${info.max_backdate_days} days`} />
            </>
          )}
        </Panel>

        <Panel className="px-5">
          <p className="text-xs font-bold tracking-wide text-muted uppercase pt-4 pb-2">AI Investigate</p>
          {info && (
            <>
              <Row
                label="Status"
                value={
                  <StatusBadge tone={info.ai_configured ? "safe" : "muted"}>
                    {info.ai_configured ? "Configured" : "Not configured"}
                  </StatusBadge>
                }
              />
              {info.ai_configured && info.anthropic_model && (
                <Row label="Model" value={info.anthropic_model} mono />
              )}
              {!info.ai_configured && (
                <p className="text-xs text-muted pb-3">
                  Set <code className="bg-surface px-1 rounded">ANTHROPIC_API_KEY</code> in{" "}
                  <code className="bg-surface px-1 rounded">backend/.env</code> to enable the AI Investigate feature.
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel className="px-5">
          <p className="text-xs font-bold tracking-wide text-muted uppercase pt-4 pb-2">Ledger</p>
          {chain && (
            <>
              <Row label="Total events in chain" value={chain.total_events.toLocaleString()} mono />
              <Row
                label="Sequence range"
                value={chain.first_sequence_num !== null ? `${chain.first_sequence_num} → ${chain.last_sequence_num}` : "—"}
                mono
              />
              <Row
                label="First event"
                value={chain.first_event_at ? new Date(chain.first_event_at).toLocaleDateString() : "—"}
              />
              <Row
                label="Last event"
                value={chain.last_event_at ? new Date(chain.last_event_at).toLocaleString() : "—"}
              />
            </>
          )}
          {stats && <Row label="Active sources" value={stats.active_sources} />}
        </Panel>

        <Panel className="px-5">
          <p className="text-xs font-bold tracking-wide text-muted uppercase pt-4 pb-2">Session</p>
          <Row label="Signed in as" value={session?.username ?? "—"} />
          <Row label="Role" value={<StatusBadge tone="accent">{session?.role ?? "—"}</StatusBadge>} />
          {info?.cors_origins && (
            <div className="py-3 border-b border-border last:border-0">
              <p className="text-sm text-muted mb-1">Allowed CORS origins</p>
              <div className="flex flex-wrap gap-1.5">
                {info.cors_origins.map((o) => (
                  <code key={o} className="text-xs bg-surface border border-border rounded px-2 py-0.5">
                    {o}
                  </code>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <UserManagementPanel />

        <Panel className="px-5">
          <p className="text-xs font-bold tracking-wide text-muted uppercase pt-4 pb-2">Immutability guarantees</p>
          <div className="text-sm text-muted space-y-1.5 pb-4">
            <p>✓ App DB role: INSERT + SELECT only on ledger.events</p>
            <p>✓ BEFORE UPDATE/DELETE triggers reject mutations at DB level</p>
            <p>✓ SHA-256 hash chain — any out-of-band edit detectable</p>
            <p className="text-warn">⚠ Postgres superuser can bypass triggers — external notarization is Phase 2</p>
          </div>
        </Panel>
      </main>
    </div>
  );
}
