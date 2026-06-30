"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import Badge from "@/components/Badge";
import {
  listAllUsers, suspendClientUser, activateClientUser, resetClientUserPassword,
  UserWithTenant, ApiError,
} from "@/lib/api-client";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  investigator: "Investigator",
  chief_auditor: "Chief Auditor",
  compliance_officer: "Compliance",
  security_officer: "Security",
  executive_authority: "Executive",
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function UsersPage() {
  const ready = useRequireAuth();
  const [users, setUsers] = useState<UserWithTenant[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ready) return;
    listAllUsers().then(setUsers).catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load users"));
  }, [ready]);

  async function toggleUser(u: UserWithTenant) {
    setActing(u.id);
    try {
      const updated = u.is_active ? await suspendClientUser(u.id) : await activateClientUser(u.id);
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Action failed"); }
    finally { setActing(null); }
  }

  async function handleResetPassword(u: UserWithTenant) {
    setActing(u.id);
    try {
      const { temp_password } = await resetClientUserPassword(u.id);
      setTempPassword({ username: u.username, password: temp_password });
    } catch (e) { setError(e instanceof ApiError ? e.message : "Reset failed"); }
    finally { setActing(null); }
  }

  function copyPassword() {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const roles = ["all", ...Array.from(new Set(users.map((u) => u.role)))];
  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = u.username.toLowerCase().includes(q) || (u.tenant_name ?? "").toLowerCase().includes(q);
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  if (!ready) return null;

  return (
    <AppShell>
      <main className="p-8 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">All Users</h1>
          <p className="text-sm text-muted mt-1">{users.length} users across all client organisations</p>
        </div>

        {error && <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>}

        <Panel>
          <div className="px-6 py-4 border-b border-border flex flex-wrap gap-3 items-center">
            <input
              type="text"
              placeholder="Search by username or tenant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60 w-72"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
            >
              {roles.map((r) => (
                <option key={r} value={r}>{r === "all" ? "All Roles" : ROLE_LABELS[r] ?? r}</option>
              ))}
            </select>
            <span className="ml-auto text-xs text-muted">{filtered.length} of {users.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider">
                  <th className="px-6 py-3 text-left font-semibold">Username</th>
                  <th className="px-4 py-3 text-left font-semibold">Organisation</th>
                  <th className="px-4 py-3 text-left font-semibold">Role</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Joined</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                    <td className="px-6 py-3 font-mono text-text text-xs">{u.username}</td>
                    <td className="px-4 py-3">
                      {u.tenant_name
                        ? <a href={`/tenants/${u.tenant_id}`} className="text-text hover:text-accent transition-colors">{u.tenant_name}</a>
                        : <span className="text-muted italic">—</span>}
                    </td>
                    <td className="px-4 py-3"><Badge variant="neutral">{ROLE_LABELS[u.role] ?? u.role}</Badge></td>
                    <td className="px-4 py-3"><Badge variant={u.is_active ? "active" : "suspended"}>{u.is_active ? "Active" : "Inactive"}</Badge></td>
                    <td className="px-4 py-3 text-right text-muted text-xs">{fmt(u.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => toggleUser(u)}
                          disabled={acting === u.id}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                            u.is_active ? "text-warn hover:bg-warn/10 bg-warn/5" : "text-safe hover:bg-safe/10 bg-safe/5"
                          }`}
                        >
                          {acting === u.id ? "…" : u.is_active ? "Suspend" : "Activate"}
                        </button>
                        <button
                          onClick={() => handleResetPassword(u)}
                          disabled={acting === u.id}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg text-muted hover:text-text hover:bg-surface border border-border transition-colors disabled:opacity-50"
                        >
                          Reset PW
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-muted">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>

      {/* Temp Password Modal */}
      {tempPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-panel border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-semibold text-text mb-1">Password Reset</h3>
            <p className="text-xs text-muted mb-4">
              Temporary password for <span className="font-mono text-text">{tempPassword.username}</span>. Share securely — this is shown once.
            </p>
            <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2">
              <span className="font-mono text-sm text-text flex-1 select-all">{tempPassword.password}</span>
              <button
                onClick={copyPassword}
                className="text-xs text-accent hover:text-accent/80 font-semibold transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => { setTempPassword(null); setCopied(false); }}
              className="mt-4 w-full py-2 border border-border text-sm text-muted rounded-lg hover:text-text transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
