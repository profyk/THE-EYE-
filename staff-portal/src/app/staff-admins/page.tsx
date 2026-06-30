"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import Badge from "@/components/Badge";
import {
  listStaffAdmins, createStaffAdmin, suspendStaffAdmin,
  activateStaffAdmin, deleteStaffAdmin, StaffAdmin, ApiError,
} from "@/lib/api-client";

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function PasswordStrength({ password }: { password: string }) {
  const hasLen = password.length >= 12;
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const score = [hasLen, hasUpper, hasDigit].filter(Boolean).length;
  const label = score === 0 ? "" : score === 1 ? "Weak" : score === 2 ? "Fair" : "Strong";
  const color = score === 1 ? "bg-danger" : score === 2 ? "bg-warn" : score === 3 ? "bg-safe" : "bg-border";
  if (!password) return null;
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="flex gap-0.5 flex-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? color : "bg-border"}`} />
        ))}
      </div>
      <span className="text-[10px] text-muted">{label}</span>
    </div>
  );
}

export default function StaffAdminsPage() {
  const ready = useRequireAuth();
  const session = getSession();
  const [admins, setAdmins] = useState<StaffAdmin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<StaffAdmin | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    if (!ready) return;
    listStaffAdmins().then(setAdmins).catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"));
  }, [ready]);

  async function toggleAdmin(a: StaffAdmin) {
    setActing(a.id);
    try {
      const updated = a.is_active ? await suspendStaffAdmin(a.id) : await activateStaffAdmin(a.id);
      setAdmins((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Action failed"); }
    finally { setActing(null); }
  }

  async function handleDelete(a: StaffAdmin) {
    setActing(a.id);
    try {
      await deleteStaffAdmin(a.id);
      setAdmins((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Delete failed"); }
    finally { setActing(null); setConfirmDelete(null); }
  }

  async function handleCreate() {
    setCreateError("");
    if (!newUsername.trim() || !newPassword) { setCreateError("Username and password are required"); return; }
    if (newPassword.length < 12) { setCreateError("Password must be at least 12 characters"); return; }
    setCreating(true);
    try {
      const admin = await createStaffAdmin(newUsername.trim(), newPassword);
      setAdmins((prev) => [...prev, admin]);
      setShowModal(false); setNewUsername(""); setNewPassword("");
    } catch (e) { setCreateError(e instanceof ApiError ? e.message : "Failed to create"); }
    finally { setCreating(false); }
  }

  if (!ready) return null;

  return (
    <AppShell>
      <main className="p-8 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">Staff Team</h1>
            <p className="text-sm text-muted mt-1">{admins.length} staff admin{admins.length !== 1 ? "s" : ""} with platform access</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-accent text-void text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            + Add Admin
          </button>
        </div>

        {error && <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>}

        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider">
                  <th className="px-6 py-3 text-left font-semibold">Username</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Joined</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => {
                  const isSelf = a.username === session?.username;
                  const isOnly = admins.length === 1;
                  return (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                      <td className="px-6 py-3">
                        <span className="font-mono text-text text-xs">{a.username}</span>
                        {isSelf && <span className="ml-2 text-[9px] text-accent font-bold uppercase tracking-wider">You</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={a.is_active ? "active" : "suspended"}>{a.is_active ? "Active" : "Suspended"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted text-xs">{fmt(a.created_at)}</td>
                      <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                        {!isSelf && (
                          <>
                            <button
                              onClick={() => toggleAdmin(a)}
                              disabled={acting === a.id}
                              className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                                a.is_active ? "text-warn hover:bg-warn/10 bg-warn/5" : "text-safe hover:bg-safe/10 bg-safe/5"
                              }`}
                            >
                              {acting === a.id ? "…" : a.is_active ? "Suspend" : "Activate"}
                            </button>
                            {!isOnly && (
                              <button
                                onClick={() => setConfirmDelete(a)}
                                disabled={acting === a.id}
                                className="text-xs font-semibold px-3 py-1 rounded-lg text-danger hover:bg-danger/10 bg-danger/5 transition-colors disabled:opacity-50"
                              >
                                Delete
                              </button>
                            )}
                          </>
                        )}
                        {isSelf && <span className="text-xs text-muted italic">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {admins.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-muted">No staff admins found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Add Admin Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-panel border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
              <h3 className="font-semibold text-text mb-4">Add Staff Admin</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted uppercase tracking-wider">Username</label>
                  <input
                    className="mt-1 w-full bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                    placeholder="e.g. jane.doe"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-muted uppercase tracking-wider">Password</label>
                  <input
                    type="password"
                    className="mt-1 w-full bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                    placeholder="Min. 12 chars, 1 uppercase, 1 digit"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <PasswordStrength password={newPassword} />
                </div>
                {createError && <p className="text-xs text-danger">{createError}</p>}
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex-1 py-2 bg-accent text-void text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {creating ? "Creating…" : "Create Admin"}
                </button>
                <button
                  onClick={() => { setShowModal(false); setNewUsername(""); setNewPassword(""); setCreateError(""); }}
                  className="px-4 py-2 border border-border text-sm text-muted rounded-lg hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Delete Modal */}
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-panel border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="font-semibold text-text mb-2">Delete Admin</h3>
              <p className="text-sm text-muted mb-4">
                Permanently delete <span className="font-mono text-text">{confirmDelete.username}</span>? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDelete(confirmDelete)}
                  disabled={acting === confirmDelete.id}
                  className="flex-1 py-2 bg-danger text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {acting === confirmDelete.id ? "Deleting…" : "Delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 border border-border text-sm text-muted rounded-lg hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
