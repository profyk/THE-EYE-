"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";
import {
  getTenant, suspendTenant, activateTenant, getTenantUsers, getTenantNotes,
  addTenantNote, deleteTenantNote, listAllApiKeys, revokeApiKey,
  TenantStats, UserWithTenant, StaffNote, StaffApiKey, ApiError,
} from "@/lib/api-client";

type Tab = "overview" | "users" | "keys" | "notes";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", investigator: "Investigator", chief_auditor: "Chief Auditor",
  compliance_officer: "Compliance", security_officer: "Security", executive_authority: "Executive",
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(d: string | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TenantDetailPage() {
  const ready = useRequireAuth();
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<TenantStats | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  // Tab data
  const [users, setUsers] = useState<UserWithTenant[]>([]);
  const [keys, setKeys] = useState<StaffApiKey[]>([]);
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [userActing, setUserActing] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    getTenant(id).then(setTenant).catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load tenant"));
  }, [ready, id]);

  useEffect(() => {
    if (!ready || !tenant) return;
    if (tab === "users" && users.length === 0) {
      getTenantUsers(tenant.id).then(setUsers).catch(() => {});
    }
    if (tab === "keys" && keys.length === 0) {
      listAllApiKeys().then((all) => setKeys(all.filter((k) => k.tenant_id === tenant.id))).catch(() => {});
    }
    if (tab === "notes" && notes.length === 0) {
      getTenantNotes(tenant.id).then(setNotes).catch(() => {});
    }
  }, [tab, ready, tenant]);

  async function toggleTenant() {
    if (!tenant) return;
    setActing(true);
    try {
      const updated = tenant.is_active ? await suspendTenant(tenant.id) : await activateTenant(tenant.id);
      setTenant(updated);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Action failed"); }
    finally { setActing(false); }
  }

  async function toggleUser(u: UserWithTenant) {
    const { suspendClientUser, activateClientUser } = await import("@/lib/api-client");
    setUserActing(u.id);
    try {
      const updated = u.is_active ? await suspendClientUser(u.id) : await activateClientUser(u.id);
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed"); }
    finally { setUserActing(null); }
  }

  async function handleRevoke(k: StaffApiKey) {
    setRevoking(k.id);
    try {
      await revokeApiKey(k.id);
      setKeys((prev) => prev.map((x) => (x.id === k.id ? { ...x, is_active: false } : x)));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Revoke failed"); }
    finally { setRevoking(null); }
  }

  async function postNote() {
    if (!tenant || !newNote.trim()) return;
    setPosting(true);
    try {
      const note = await addTenantNote(tenant.id, newNote.trim());
      setNotes((prev) => [note, ...prev]);
      setNewNote("");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed to post"); }
    finally { setPosting(false); }
  }

  async function deleteNote(noteId: string) {
    if (!tenant) return;
    setDeleting(noteId);
    try {
      await deleteTenantNote(tenant.id, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Delete failed"); }
    finally { setDeleting(null); }
  }

  if (!ready) return null;

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "users",    label: `Users${users.length ? ` (${users.length})` : ""}` },
    { id: "keys",     label: `API Keys${keys.length ? ` (${keys.length})` : ""}` },
    { id: "notes",    label: `Support Notes${notes.length ? ` (${notes.length})` : ""}` },
  ];

  return (
    <AppShell>
      <main className="p-8 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <a href="/tenants" className="text-xs text-muted hover:text-accent transition-colors">← Tenants</a>
            <h1 className="text-2xl font-bold text-text tracking-tight mt-1">{tenant?.name ?? "Loading…"}</h1>
            {tenant && <p className="text-sm text-muted mt-0.5 font-mono">{tenant.slug}</p>}
          </div>
          {tenant && (
            <div className="flex items-center gap-3">
              <Badge variant={tenant.is_active ? "active" : "suspended"}>{tenant.is_active ? "Active" : "Suspended"}</Badge>
              <button
                onClick={toggleTenant}
                disabled={acting}
                className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                  tenant.is_active ? "bg-danger/10 text-danger hover:bg-danger/20" : "bg-safe/10 text-safe hover:bg-safe/20"
                }`}
              >
                {acting ? "…" : tenant.is_active ? "Suspend Tenant" : "Activate Tenant"}
              </button>
            </div>
          )}
        </div>

        {error && <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2 ${
                tab === t.id
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && tenant && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Users" value={tenant.user_count} tone="accent" />
              <StatCard label="Events (30d)" value={tenant.event_count_30d.toLocaleString()} tone="warn" />
              <StatCard label="Billing" value={tenant.paddle_subscription_status ?? "Trial"} tone={tenant.paddle_subscription_status === "active" ? "safe" : "muted"} />
              <StatCard label="Last Event" value={tenant.last_event_at ? new Date(tenant.last_event_at).toLocaleDateString("en-GB") : "Never"} tone="muted" />
            </div>
            <Panel>
              <div className="px-6 py-4 border-b border-border">
                <p className="text-sm font-semibold text-text">Tenant Details</p>
              </div>
              <div className="px-6 py-5 grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                {[
                  ["Tenant ID", tenant.id],
                  ["Slug", tenant.slug],
                  ["Status", tenant.is_active ? "Active" : "Suspended"],
                  ["Created", fmt(tenant.created_at)],
                  ["Last Event", fmt(tenant.last_event_at)],
                  ["Subscription", tenant.paddle_subscription_status ?? "Trial"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-text font-mono text-xs break-all">{value}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </>
        )}

        {/* ── Users ── */}
        {tab === "users" && (
          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider">
                    <th className="px-6 py-3 text-left font-semibold">Username</th>
                    <th className="px-4 py-3 text-left font-semibold">Role</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Joined</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                      <td className="px-6 py-3 font-mono text-text text-xs">{u.username}</td>
                      <td className="px-4 py-3"><Badge variant="neutral">{ROLE_LABELS[u.role] ?? u.role}</Badge></td>
                      <td className="px-4 py-3"><Badge variant={u.is_active ? "active" : "suspended"}>{u.is_active ? "Active" : "Inactive"}</Badge></td>
                      <td className="px-4 py-3 text-right text-muted text-xs">{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => toggleUser(u)}
                          disabled={userActing === u.id}
                          className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                            u.is_active ? "text-warn hover:bg-warn/10 bg-warn/5" : "text-safe hover:bg-safe/10 bg-safe/5"
                          }`}
                        >
                          {userActing === u.id ? "…" : u.is_active ? "Suspend" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-muted">No users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* ── API Keys ── */}
        {tab === "keys" && (
          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider">
                    <th className="px-6 py-3 text-left font-semibold">Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Prefix</th>
                    <th className="px-4 py-3 text-left font-semibold">Last Used</th>
                    <th className="px-4 py-3 text-left font-semibold">Expires</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className={`border-b border-border/50 transition-colors ${k.is_active ? "hover:bg-surface/50" : "opacity-50"}`}>
                      <td className="px-6 py-3 font-medium text-text">{k.name}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-surface border border-border px-2 py-0.5 rounded text-accent">{k.key_prefix}…</span>
                      </td>
                      <td className="px-4 py-3 text-muted text-xs">{fmtDate(k.last_used_at)}</td>
                      <td className="px-4 py-3 text-muted text-xs">{fmtDate(k.expires_at)}</td>
                      <td className="px-4 py-3"><Badge variant={k.is_active ? "active" : "suspended"}>{k.is_active ? "Active" : "Revoked"}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        {k.is_active && (
                          <button
                            onClick={() => handleRevoke(k)}
                            disabled={revoking === k.id}
                            className="text-xs font-semibold px-3 py-1 rounded-lg text-danger hover:bg-danger/10 bg-danger/5 transition-colors disabled:opacity-50"
                          >
                            {revoking === k.id ? "…" : "Revoke"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {keys.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-10 text-center text-muted">No API keys for this tenant.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* ── Support Notes ── */}
        {tab === "notes" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <textarea
                className="flex-1 bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none h-20 placeholder-muted"
                placeholder="Add an internal note about this client… (⌘↵ to post)"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postNote(); }}
              />
              <button
                onClick={postNote}
                disabled={posting || !newNote.trim()}
                className="px-4 self-start mt-0 py-2 bg-accent text-void text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>

            {notes.length === 0 ? (
              <Panel>
                <div className="py-12 text-center text-muted">
                  <p className="text-sm">No support notes yet</p>
                  <p className="text-xs mt-1">Add context, escalation notes, or account history here</p>
                </div>
              </Panel>
            ) : (
              <div className="space-y-3">
                {notes.map((n) => (
                  <div key={n.id} className="bg-panel border border-border rounded-xl px-4 py-3 group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-accent">{n.author_username}</span>
                        <span className="text-[10px] text-muted">{fmt(n.created_at)}</span>
                      </div>
                      <button
                        onClick={() => deleteNote(n.id)}
                        disabled={deleting === n.id}
                        className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-all disabled:opacity-50 text-xs"
                      >
                        {deleting === n.id ? "…" : "✕"}
                      </button>
                    </div>
                    <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}
