"use client";

import { FormEvent, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Button from "@/components/Button";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getSession } from "@/lib/auth";
import { createUser, deactivateUser, listUsers, ApiError, UserRead } from "@/lib/api-client";

const ROLES = ["admin", "investigator", "chief_auditor", "compliance_officer", "security_officer", "executive_authority"];

const INPUT_CLASS =
  "border border-border bg-surface text-text rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
const LABEL_CLASS = "flex flex-col text-xs uppercase tracking-wide text-muted font-semibold gap-1";

export default function UsersAdminPage() {
  const ready = useRequireAuth();
  const session = getSession();
  const [users, setUsers] = useState<UserRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("investigator");
  const [creating, setCreating] = useState(false);

  function refresh() {
    listUsers()
      .then(setUsers)
      .catch((e: ApiError) => setError(e.message || "Failed to load users"));
  }

  useEffect(() => {
    if (!ready) return;
    refresh();
  }, [ready]);

  if (!ready) return null;

  if (session?.role !== "admin") {
    return (
      <div className="flex flex-1 flex-col">
        <NavBar />
        <main className="p-6">
          <p className="text-sm text-danger">You do not have permission to view this page.</p>
        </main>
      </div>
    );
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createUser(username, password, role);
      setUsername("");
      setPassword("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await deactivateUser(id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to deactivate user");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="p-6 flex-1 max-w-3xl">
        <h1 className="text-lg font-semibold mb-4">Users</h1>

        <form
          onSubmit={handleCreate}
          className="flex flex-wrap gap-3 items-end mb-6 p-4 rounded-xl border border-border bg-panel"
        >
          <label className={LABEL_CLASS}>
            Username
            <input className={INPUT_CLASS} value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label className={LABEL_CLASS}>
            Password
            <input
              type="password"
              className={INPUT_CLASS}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className={LABEL_CLASS}>
            Role
            <select className={INPUT_CLASS} value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create user"}
          </Button>
        </form>

        {error && <p className="text-sm text-danger mb-4">{error}</p>}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-border bg-surface">
                <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Username</th>
                <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Role</th>
                <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Status</th>
                <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Created</th>
                <th className="py-2.5 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface transition-colors">
                  <td className="py-2.5 px-3">{u.username}</td>
                  <td className="py-2.5 px-3 text-muted">{u.role}</td>
                  <td className="py-2.5 px-3">{u.is_active ? "Active" : "Deactivated"}</td>
                  <td className="py-2.5 px-3 text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="py-2.5 px-3">
                    {u.is_active && (
                      <button
                        onClick={() => handleDeactivate(u.id)}
                        className="text-danger hover:underline text-xs font-semibold cursor-pointer"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
