"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import Button from "@/components/Button";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getSession } from "@/lib/auth";
import { applyTheme, initialTheme, Theme } from "@/lib/theme";
import {
  getChainSummary, getTenantSubscription, listUsers, createUser,
  deactivateUser, resetUserPassword,
  ApiError, ChainSummary, SubscriptionOut, UserRead,
} from "@/lib/api-client";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLES = [
  "admin", "investigator", "chief_auditor",
  "compliance_officer", "security_officer", "executive_authority",
];

function fmtRole(r: string) {
  return r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_COLOR: Record<string, string> = {
  active:    "text-[var(--safe)]   bg-[var(--safe)]/10   border-[var(--safe)]/20",
  trialing:  "text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/20",
  past_due:  "text-[var(--warn)]   bg-[var(--warn)]/10   border-[var(--warn)]/20",
  canceled:  "text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/20",
  cancelled: "text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/20",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
      {subtitle && <p className="text-sm text-[var(--muted)] mt-0.5">{subtitle}</p>}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-[var(--border)]" />;
}

function AppearanceSection() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => { setTheme(initialTheme()); }, []);

  function pick(t: Theme) {
    applyTheme(t);
    setTheme(t);
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {(["light", "dark"] as Theme[]).map((t) => {
        const active = theme === t;
        return (
          <button
            key={t}
            onClick={() => pick(t)}
            className={`relative rounded-xl border-2 p-4 text-left transition-all ${
              active
                ? "border-[var(--accent)] bg-[var(--accent)]/5"
                : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/40"
            }`}
          >
            {/* Mini preview */}
            <div className={`rounded-lg mb-3 h-16 overflow-hidden flex flex-col gap-1 p-2 ${
              t === "dark" ? "bg-zinc-900" : "bg-white border border-zinc-200"
            }`}>
              <div className={`h-2 w-2/3 rounded-full ${t === "dark" ? "bg-zinc-600" : "bg-zinc-200"}`} />
              <div className={`h-1.5 w-full rounded-full ${t === "dark" ? "bg-zinc-700" : "bg-zinc-100"}`} />
              <div className={`h-1.5 w-4/5 rounded-full ${t === "dark" ? "bg-zinc-700" : "bg-zinc-100"}`} />
              <div className={`mt-1 h-3 w-1/3 rounded-md ${t === "dark" ? "bg-cyan-600" : "bg-blue-500"}`} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold capitalize text-[var(--text)]">{t}</span>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                active ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"
              }`}>
                {active && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TeamPanel({ isAdmin }: { isAdmin: boolean }) {
  const [users, setUsers] = useState<UserRead[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState("admin");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [resettingPw, setResettingPw] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [resetTarget, setResetTarget] = useState<string | null>(null);

  const load = () =>
    listUsers()
      .then(setUsers)
      .catch((e: unknown) => setLoadErr(e instanceof ApiError ? e.message : "Failed to load team"));

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null); setSaving(true);
    try {
      await createUser(username, password, role);
      setUsername(""); setPassword(""); setRole("admin"); setShowForm(false);
      await load();
    } catch (e: unknown) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to create user");
    } finally { setSaving(false); }
  }

  async function handleDeactivate(id: string) {
    setDeactivating(id);
    try { await deactivateUser(id); await load(); }
    finally { setDeactivating(null); }
  }

  async function handleResetPw(id: string) {
    if (!newPw) return;
    setResettingPw(id);
    try {
      await resetUserPassword(id, newPw);
      setResetTarget(null); setNewPw("");
    } catch { /* ignore */ }
    finally { setResettingPw(null); }
  }

  if (!isAdmin) return null;

  const inputCls = "w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionHeader title="Team Members" subtitle="Manage who has access to this workspace." />
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Invite member
          </button>
        )}
      </div>

      {loadErr && (
        <p className="text-sm text-[var(--danger)] mb-3">{loadErr}</p>
      )}

      {showForm && (
        <Panel className="mb-4 p-5">
          <p className="text-sm font-semibold text-[var(--text)] mb-3">New Team Member</p>
          {formErr && <p className="text-xs text-[var(--danger)] mb-2">{formErr}</p>}
          <form onSubmit={handleCreate} className="space-y-3">
            <input required placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} className={inputCls} />
            <div className="relative">
              <input
                required type={showPw ? "text" : "password"}
                placeholder="Password (12+ characters)"
                value={password} onChange={e => setPassword(e.target.value)}
                className={`${inputCls} pr-10`}
              />
              <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showPw
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                  }
                </svg>
              </button>
            </div>
            <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
              {ROLES.map(r => <option key={r} value={r}>{fmtRole(r)}</option>)}
            </select>
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={saving} className="text-sm">{saving ? "Creating…" : "Create member"}</Button>
              <Button type="button" variant="ghost" tone="muted" className="text-sm" onClick={() => { setShowForm(false); setFormErr(null); }}>
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      )}

      <Panel>
        {users.length === 0 && !loadErr ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--muted)]">No team members yet.</div>
        ) : (
          <div className="divide-y divide-[var(--border)]/60">
            {users.map(u => {
              const initials = u.username.slice(0, 2).toUpperCase();
              const isResetting = resetTarget === u.id;
              return (
                <div key={u.id} className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      u.is_active ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--surface)] text-[var(--muted)]"
                    }`}>
                      {initials}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold ${u.is_active ? "text-[var(--text)]" : "text-[var(--muted)] line-through"}`}>
                          {u.username}
                        </p>
                        {!u.is_active && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border text-[var(--muted)] bg-[var(--surface)] border-[var(--border)]">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--muted)]">{fmtRole(u.role)}</p>
                    </div>
                    {/* Actions */}
                    {u.is_active && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setResetTarget(isResetting ? null : u.id); setNewPw(""); }}
                          className="text-xs text-[var(--muted)] hover:text-[var(--text)] px-2 py-1 rounded-lg hover:bg-[var(--surface)] transition-colors"
                        >
                          Reset pw
                        </button>
                        <button
                          onClick={() => handleDeactivate(u.id)}
                          disabled={deactivating === u.id}
                          className="text-xs text-[var(--muted)] hover:text-[var(--danger)] px-2 py-1 rounded-lg hover:bg-[var(--danger)]/10 transition-colors disabled:opacity-50"
                        >
                          {deactivating === u.id ? "…" : "Remove"}
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Inline password reset */}
                  {isResetting && (
                    <div className="mt-3 flex gap-2 pl-12">
                      <input
                        type="password" placeholder="New password"
                        value={newPw} onChange={e => setNewPw(e.target.value)}
                        className="flex-1 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[var(--accent)]/60"
                      />
                      <button
                        onClick={() => handleResetPw(u.id)}
                        disabled={!newPw || resettingPw === u.id}
                        className="text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80 disabled:opacity-40 px-3"
                      >
                        {resettingPw === u.id ? "…" : "Save"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const ready = useRequireAuth();
  const session = getSession();
  const isAdmin = session?.role === "admin";

  const [sub, setSub] = useState<SubscriptionOut | null>(null);
  const [chain, setChain] = useState<ChainSummary | null>(null);

  useEffect(() => {
    if (!ready) return;
    getChainSummary().then(setChain).catch(() => null);
    getTenantSubscription().then(setSub).catch(() => null);
  }, [ready]);

  if (!ready) return null;

  const initials = (session?.username ?? "?").slice(0, 2).toUpperCase();
  const statusKey = sub?.paddle_subscription_status ?? "trialing";
  const statusCls = STATUS_COLOR[statusKey] ?? "text-[var(--muted)] bg-[var(--surface)] border-[var(--border)]";

  return (
    <NavBar>
      <main className="p-6 md:p-10 flex-1 max-w-2xl space-y-10">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Settings</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Manage your account, workspace, and preferences.</p>
        </div>

        {/* ── Account ── */}
        <section>
          <SectionHeader title="Account" />
          <Panel>
            <div className="p-5 flex items-center gap-5">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/15 flex items-center justify-center shrink-0">
                <span className="text-xl font-bold text-[var(--accent)]">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-[var(--text)]">{session?.username}</p>
                <p className="text-sm text-[var(--muted)]">
                  {sub?.tenant_name ?? "—"}
                  {sub?.tenant_name && session?.role ? " · " : ""}
                  {fmtRole(session?.role ?? "")}
                </p>
              </div>
              <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                {
                  admin: "text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/20",
                  investigator: "text-[var(--safe)] bg-[var(--safe)]/10 border-[var(--safe)]/20",
                }[session?.role ?? ""] ?? "text-[var(--muted)] bg-[var(--surface)] border-[var(--border)]"
              }`}>
                {fmtRole(session?.role ?? "—")}
              </span>
            </div>
          </Panel>
        </section>

        {/* ── Appearance ── */}
        <section>
          <SectionHeader title="Appearance" subtitle="Choose how THE EYE looks on this device." />
          <AppearanceSection />
        </section>

        {/* ── Organization ── */}
        <section>
          <SectionHeader title="Organization" subtitle="Your workspace and subscription details." />
          <Panel>
            <div className="divide-y divide-[var(--border)]/60">

              {/* Tenant */}
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-0.5">Workspace</p>
                  <p className="text-sm font-semibold text-[var(--text)]">{sub?.tenant_name ?? "—"}</p>
                </div>
              </div>

              {/* Plan */}
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-0.5">Current Plan</p>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {sub?.plan?.name ?? "No plan"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {sub && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${statusCls}`}>
                      {statusKey.replace(/_/g, " ")}
                    </span>
                  )}
                  <Link href="/billing"
                    className="text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors">
                    Manage →
                  </Link>
                </div>
              </div>

              {/* Plan limits */}
              {sub?.plan?.limits && (
                <div className="px-5 py-4">
                  <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-3">Plan Limits</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Users", value: sub.plan.limits.users ?? "Unlimited" },
                      { label: "API Keys", value: sub.plan.limits.api_keys ?? "Unlimited" },
                      { label: "Events / month", value: sub.plan.limits.events_per_month != null ? (sub.plan.limits.events_per_month as number / 1000).toFixed(0) + "k" : "Unlimited" },
                      { label: "Retention", value: sub.plan.limits.retention_days != null ? `${sub.plan.limits.retention_days} days` : "Custom" },
                    ].map(item => (
                      <div key={item.label} className="bg-[var(--surface)] rounded-xl px-3 py-2.5">
                        <p className="text-xs text-[var(--muted)]">{item.label}</p>
                        <p className="text-sm font-bold text-[var(--text)] font-mono mt-0.5">{String(item.value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* API Keys shortcut */}
              {isAdmin && (
                <div className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-0.5">Agent API Keys</p>
                    <p className="text-sm text-[var(--muted)]">Manage keys used to connect THE EYE Agent</p>
                  </div>
                  <Link href="/admin/api-keys"
                    className="text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors">
                    View →
                  </Link>
                </div>
              )}

            </div>
          </Panel>
        </section>

        {/* ── Audit Ledger ── */}
        <section>
          <SectionHeader title="Audit Ledger" subtitle="Your tamper-evident event log status." />
          <Panel>
            <div className="divide-y divide-[var(--border)]/60">

              {chain ? (
                <>
                  <div className="px-5 py-4 flex items-center justify-between">
                    <p className="text-sm text-[var(--muted)]">Events recorded</p>
                    <p className="text-sm font-bold font-mono text-[var(--text)]">
                      {chain.total_events.toLocaleString()}
                    </p>
                  </div>
                  <div className="px-5 py-4 flex items-center justify-between">
                    <p className="text-sm text-[var(--muted)]">Last activity</p>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {timeAgo(chain.last_event_at)}
                    </p>
                  </div>
                  <div className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--muted)]">Chain integrity</p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">Every event is cryptographically linked</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--safe)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Verified
                      </span>
                      <Link href="/chain" className="text-xs text-[var(--accent)] hover:underline">View →</Link>
                    </div>
                  </div>
                </>
              ) : (
                <div className="px-5 py-6 text-center text-sm text-[var(--muted)]">
                  Loading ledger status…
                </div>
              )}

            </div>
          </Panel>
        </section>

        {/* ── Team (admin only) ── */}
        {isAdmin && (
          <section>
            <TeamPanel isAdmin={isAdmin} />
          </section>
        )}

        {/* ── Support ── */}
        <section>
          <SectionHeader title="Support" />
          <Panel>
            <div className="divide-y divide-[var(--border)]/60">
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Contact Support</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">Questions about your account or subscription</p>
                </div>
                <a href="mailto:support@theeye.com"
                  className="text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors">
                  Email →
                </a>
              </div>
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Billing Queries</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">Invoices, receipts, plan changes</p>
                </div>
                <a href="mailto:billing@theeye.com"
                  className="text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors">
                  Email →
                </a>
              </div>
            </div>
          </Panel>
        </section>

      </main>
    </NavBar>
  );
}
