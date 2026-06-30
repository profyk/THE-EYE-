"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import Badge from "@/components/Badge";
import { listAllApiKeys, revokeApiKey, StaffApiKey, ApiError } from "@/lib/api-client";

function fmt(d: string | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtFull(d: string) {
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ApiKeysPage() {
  const ready = useRequireAuth();
  const [keys, setKeys] = useState<StaffApiKey[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<StaffApiKey | null>(null);

  useEffect(() => {
    if (!ready) return;
    listAllApiKeys().then(setKeys).catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load API keys"));
  }, [ready]);

  async function handleRevoke(k: StaffApiKey) {
    setRevoking(k.id);
    try {
      await revokeApiKey(k.id);
      setKeys((prev) => prev.map((x) => (x.id === k.id ? { ...x, is_active: false } : x)));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Revoke failed"); }
    finally { setRevoking(null); setConfirmRevoke(null); }
  }

  const filtered = keys.filter((k) => {
    const q = search.toLowerCase();
    return k.name.toLowerCase().includes(q) || k.tenant_name.toLowerCase().includes(q) || k.key_prefix.toLowerCase().includes(q);
  });

  const active = keys.filter((k) => k.is_active).length;
  const revoked = keys.length - active;

  if (!ready) return null;

  return (
    <AppShell>
      <main className="p-8 space-y-6 animate-fade-in">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">API Keys</h1>
            <p className="text-sm text-muted mt-1">
              <span className="text-safe font-semibold">{active}</span> active ·{" "}
              <span className="text-danger font-semibold">{revoked}</span> revoked across all organisations
            </p>
          </div>
        </div>

        {error && <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>}

        <Panel>
          <div className="px-6 py-4 border-b border-border">
            <input
              type="text"
              placeholder="Search by key name, tenant, or prefix…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60 w-80"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider">
                  <th className="px-6 py-3 text-left font-semibold">Key Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Prefix</th>
                  <th className="px-4 py-3 text-left font-semibold">Organisation</th>
                  <th className="px-4 py-3 text-left font-semibold">Created By</th>
                  <th className="px-4 py-3 text-left font-semibold">Last Used</th>
                  <th className="px-4 py-3 text-left font-semibold">Expires</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((k) => (
                  <tr
                    key={k.id}
                    className={`border-b border-border/50 transition-colors ${k.is_active ? "hover:bg-surface/50" : "opacity-50"}`}
                  >
                    <td className="px-6 py-3">
                      <span className={`font-medium ${k.is_active ? "text-text" : "line-through text-muted"}`}>{k.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-surface border border-border px-2 py-0.5 rounded text-accent">{k.key_prefix}…</span>
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/tenants/${k.tenant_id}`} className="text-text hover:text-accent transition-colors">{k.tenant_name}</a>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs font-mono">{k.created_by_username ?? "—"}</td>
                    <td className="px-4 py-3 text-muted text-xs">{fmt(k.last_used_at)}</td>
                    <td className="px-4 py-3 text-muted text-xs">{fmt(k.expires_at)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={k.is_active ? "active" : "suspended"}>{k.is_active ? "Active" : "Revoked"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {k.is_active && (
                        <button
                          onClick={() => setConfirmRevoke(k)}
                          disabled={revoking === k.id}
                          className="text-xs font-semibold px-3 py-1 rounded-lg text-danger hover:bg-danger/10 bg-danger/5 transition-colors disabled:opacity-50"
                        >
                          {revoking === k.id ? "…" : "Revoke"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-10 text-center text-muted">No API keys found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>

      {confirmRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-panel border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-semibold text-text mb-2">Revoke API Key</h3>
            <p className="text-sm text-muted mb-1">
              Revoke <span className="font-semibold text-text">{confirmRevoke.name}</span>?
            </p>
            <p className="text-xs text-muted mb-4">
              Issued to <span className="text-text">{confirmRevoke.tenant_name}</span>. Created {fmtFull(confirmRevoke.created_at)}.
              Any agent or integration using this key will immediately lose access.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleRevoke(confirmRevoke)}
                disabled={revoking === confirmRevoke.id}
                className="flex-1 py-2 bg-danger text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {revoking === confirmRevoke.id ? "Revoking…" : "Revoke Key"}
              </button>
              <button
                onClick={() => setConfirmRevoke(null)}
                className="px-4 py-2 border border-border text-sm text-muted rounded-lg hover:text-text transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
