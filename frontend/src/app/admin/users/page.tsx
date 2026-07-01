"use client";

import { FormEvent, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Button from "@/components/Button";
import Panel from "@/components/Panel";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getSession } from "@/lib/auth";
import {
  ApiError,
  UserRead,
  changeUserRole,
  createUser,
  deactivateUser,
  listUsers,
  reactivateUser,
  resetUserPassword,
} from "@/lib/api-client";

const ROLES = [
  "admin",
  "investigator",
  "chief_auditor",
  "compliance_officer",
  "security_officer",
  "executive_authority",
];

const ROLE_COLOR: Record<string, string> = {
  admin:               "bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20",
  investigator:        "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20",
  chief_auditor:       "bg-[var(--iris)]/10 text-[var(--iris)] border-[var(--iris)]/20",
  compliance_officer:  "bg-[var(--warn)]/10 text-[var(--warn)] border-[var(--warn)]/20",
  security_officer:    "bg-[var(--safe)]/10 text-[var(--safe)] border-[var(--safe)]/20",
  executive_authority: "bg-[var(--muted)]/10 text-[var(--muted)] border-[var(--muted)]/20",
};

const INPUT = "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40";
const LABEL = "flex flex-col text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-bold gap-1";

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_COLOR[role] ?? "bg-[var(--surface)] text-[var(--muted)] border-[var(--border)]";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${cls}`}>
      {role.replace(/_/g, " ")}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--safe)]">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--safe)]" />Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)]">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted)]" />Blocked
    </span>
  );
}

export default function UsersAdminPage() {
  const ready = useRequireAuth();
  const session = getSession();
  const myId = session?.id as string | undefined;

  const [users, setUsers] = useState<UserRead[]>([]);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("investigator");
  const [creating, setCreating] = useState(false);

  // per-row state
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<Record<string, string>>({});
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [confirmBlockId, setConfirmBlockId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  function refresh() {
    listUsers()
      .then(setUsers)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Failed to load users"));
  }

  useEffect(() => { if (ready) refresh(); }, [ready]);
  if (!ready) return null;

  if (session?.role !== "admin") {
    return (
      <NavBar>
        <main className="p-8">
          <p className="text-sm text-[var(--danger)]">Admin access required.</p>
        </main>
      </NavBar>
    );
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createUser(username, password, role);
      setUsername(""); setPassword("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally { setCreating(false); }
  }

  async function handleRoleSave(id: string) {
    const newRole = pendingRole[id];
    if (!newRole) return;
    setSavingRoleId(id);
    setError(null);
    try {
      await changeUserRole(id, newRole);
      setChangingRoleId(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change role");
    } finally { setSavingRoleId(null); }
  }

  async function handleBlock(id: string) {
    setLoadingId(id);
    setError(null);
    try {
      await deactivateUser(id);
      setConfirmBlockId(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to block user");
    } finally { setLoadingId(null); }
  }

  async function handleUnblock(id: string) {
    setLoadingId(id);
    setError(null);
    try {
      await reactivateUser(id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to unblock user");
    } finally { setLoadingId(null); }
  }

  async function handleResetPassword(id: string) {
    const pw = resetPasswords[id] ?? "";
    if (pw.length < 12) return;
    setLoadingId(id);
    setError(null);
    try {
      await resetUserPassword(id, pw);
      setResettingId(null);
      setResetPasswords((p) => { const n = { ...p }; delete n[id]; return n; });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset password");
    } finally { setLoadingId(null); }
  }

  const activeAdmins = users.filter(u => u.role === "admin" && u.is_active);

  return (
    <NavBar>
      <main className="p-6 md:p-8 flex-1 max-w-5xl space-y-8 animate-fade-in">

        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">User Management</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Manage team members, roles, and access for your organisation.</p>
        </div>

        {/* Create user */}
        <Panel className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)] mb-4">Add New User</p>
          <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
            <label className={LABEL}>
              Email / Username
              <input className={INPUT} value={username} onChange={e => setUsername(e.target.value)} required placeholder="user@company.com" />
            </label>
            <label className={LABEL}>
              Password
              <input type="password" className={INPUT} value={password} onChange={e => setPassword(e.target.value)} required minLength={12} placeholder="Min 12 characters" />
            </label>
            <label className={LABEL}>
              Role
              <select className={INPUT} value={role} onChange={e => setRole(e.target.value)}>
                {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </select>
            </label>
            <Button type="submit" disabled={creating}>{creating ? "Creating…" : "Create user"}</Button>
          </form>
        </Panel>

        {error && (
          <div className="flex items-center gap-3 bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-xl px-4 py-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-sm text-[var(--danger)]">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-[var(--muted)] hover:text-[var(--text)] text-xs">✕</button>
          </div>
        )}

        {/* Users table */}
        <Panel className="overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              Team Members <span className="ml-2 text-[var(--text)]">{users.length}</span>
            </p>
            <p className="text-[10px] text-[var(--muted)]">{activeAdmins.length} active admin{activeAdmins.length !== 1 ? "s" : ""}</p>
          </div>

          <div className="divide-y divide-[var(--border)]">
            {users.map(u => {
              const isSelf = u.id === myId;
              const isLastAdmin = u.role === "admin" && u.is_active && activeAdmins.length <= 1;
              const busy = loadingId === u.id || savingRoleId === u.id;

              return (
                <div key={u.id} className={`px-5 py-4 transition-colors ${isSelf ? "bg-[var(--accent)]/3" : "hover:bg-[var(--surface)]"}`}>
                  <div className="flex items-start gap-4 flex-wrap">

                    {/* Identity */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--text)] truncate">{u.username}</span>
                        {isSelf && <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded-full">You</span>}
                        <StatusBadge active={u.is_active} />
                      </div>
                      <p className="text-[10px] text-[var(--muted)] mt-0.5">
                        Joined {new Date(u.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </p>
                    </div>

                    {/* Role — view or edit */}
                    <div className="flex items-center gap-2 shrink-0">
                      {changingRoleId === u.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            className={`${INPUT} text-xs py-1`}
                            value={pendingRole[u.id] ?? u.role}
                            onChange={e => setPendingRole(p => ({ ...p, [u.id]: e.target.value }))}
                          >
                            {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                          </select>
                          <button
                            onClick={() => handleRoleSave(u.id)}
                            disabled={busy}
                            className="text-xs font-semibold text-[var(--accent)] hover:underline disabled:opacity-40"
                          >
                            {savingRoleId === u.id ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => setChangingRoleId(null)} className="text-xs text-[var(--muted)] hover:underline">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <RoleBadge role={u.role} />
                          {!isSelf && (
                            <button
                              onClick={() => { setChangingRoleId(u.id); setPendingRole(p => ({ ...p, [u.id]: u.role })); }}
                              className="text-[10px] text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                              title="Change role"
                            >
                              ✎
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {!isSelf && (
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Block / Unblock */}
                        {u.is_active ? (
                          confirmBlockId === u.id ? (
                            <div className="flex items-center gap-2 bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-lg px-2.5 py-1.5">
                              <span className="text-xs text-[var(--danger)]">Block {u.username.split("@")[0]}?</span>
                              <button
                                onClick={() => handleBlock(u.id)}
                                disabled={busy || isLastAdmin}
                                className="text-xs font-bold text-[var(--danger)] hover:underline disabled:opacity-40"
                              >
                                {busy ? "…" : "Confirm"}
                              </button>
                              <button onClick={() => setConfirmBlockId(null)} className="text-xs text-[var(--muted)] hover:underline">Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmBlockId(u.id)}
                              disabled={isLastAdmin}
                              title={isLastAdmin ? "Cannot block the last active admin" : "Block user"}
                              className="text-xs font-semibold text-[var(--warn)] hover:text-[var(--danger)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Block
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => handleUnblock(u.id)}
                            disabled={busy}
                            className="text-xs font-semibold text-[var(--safe)] hover:underline disabled:opacity-40"
                          >
                            {busy ? "…" : "Unblock"}
                          </button>
                        )}

                        {/* Reset password */}
                        {resettingId === u.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="password"
                              className="border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] rounded px-2 py-1 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/40"
                              placeholder="New password (12+)"
                              minLength={12}
                              value={resetPasswords[u.id] ?? ""}
                              onChange={e => setResetPasswords(p => ({ ...p, [u.id]: e.target.value }))}
                              autoFocus
                            />
                            <button
                              onClick={() => handleResetPassword(u.id)}
                              disabled={(resetPasswords[u.id] ?? "").length < 12 || busy}
                              className="text-xs font-semibold text-[var(--accent)] hover:underline disabled:opacity-40"
                            >
                              {busy ? "…" : "Save"}
                            </button>
                            <button onClick={() => setResettingId(null)} className="text-xs text-[var(--muted)] hover:underline">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setResettingId(u.id)}
                            className="text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                          >
                            Reset pwd
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {users.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-[var(--muted)]">No users yet.</div>
            )}
          </div>
        </Panel>

        <p className="text-[10px] text-[var(--muted)]">
          Blocking a user immediately revokes all active sessions. Blocked users cannot log in until unblocked.
          Role changes take effect on the user's next login.
        </p>

      </main>
    </NavBar>
  );
}
