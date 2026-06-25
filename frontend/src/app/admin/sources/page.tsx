"use client";

import { FormEvent, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getSession } from "@/lib/auth";
import { listSources, createSource, deactivateSource, ApiError, SourceRead, SourceCreated } from "@/lib/api-client";

const SOURCE_KINDS = ["db_trigger", "api_hook", "log_forwarder", "agent", "manual"] as const;

const INPUT_CLASS =
  "border border-border bg-surface text-text rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
const LABEL_CLASS = "flex flex-col text-xs uppercase tracking-wide text-muted font-semibold gap-1";

export default function SourcesAdminPage() {
  const ready = useRequireAuth();
  const session = getSession();
  const [sources, setSources] = useState<SourceRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("manual");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<SourceCreated | null>(null);

  function refresh() {
    listSources()
      .then(setSources)
      .catch((e: ApiError) => setError(e.message || "Failed to load sources"));
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
    setNewKey(null);
    try {
      const created = await createSource(name, kind);
      setNewKey(created);
      setName("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create source");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await deactivateSource(id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to deactivate source");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="p-6 flex-1 max-w-3xl">
        <h1 className="text-lg font-semibold mb-1">Ingestion Sources</h1>
        <p className="text-sm text-muted mb-4">
          Each source gets a unique API key used to authenticate event submissions. The key is shown exactly once on
          creation — it cannot be retrieved again.
        </p>

        <form
          onSubmit={handleCreate}
          className="flex flex-wrap gap-3 items-end mb-6 p-4 rounded-xl border border-border bg-panel"
        >
          <label className={LABEL_CLASS}>
            Name
            <input
              className={INPUT_CLASS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. prod-postgres-trigger"
            />
          </label>
          <label className={LABEL_CLASS}>
            Kind
            <select className={INPUT_CLASS} value={kind} onChange={(e) => setKind(e.target.value)}>
              {SOURCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={creating || !name}>
            {creating ? "Creating..." : "Create source"}
          </Button>
        </form>

        {error && <p className="text-sm text-danger mb-4">{error}</p>}

        {newKey && (
          <Panel className="p-4 mb-6 border-safe/40 bg-safe/5">
            <p className="text-xs font-semibold text-safe uppercase tracking-wide mb-2">
              Source created — API key shown once, copy it now
            </p>
            <p className="text-xs text-muted mb-1">
              <span className="font-semibold text-text">{newKey.name}</span> &middot; {newKey.source_kind}
            </p>
            <code className="block text-sm font-mono bg-surface border border-border rounded-lg px-3 py-2.5 break-all select-all">
              {newKey.api_key}
            </code>
            <p className="text-[11px] text-muted mt-2">Prefix (safe to log): {newKey.api_key_prefix}</p>
            <button
              onClick={() => setNewKey(null)}
              className="mt-3 text-xs text-muted hover:text-text transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </Panel>
        )}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-border bg-surface">
                <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Name</th>
                <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Kind</th>
                <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Key prefix</th>
                <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Status</th>
                <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Last seen</th>
                <th className="py-2.5 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface transition-colors">
                  <td className="py-2.5 px-3 font-medium">{s.name}</td>
                  <td className="py-2.5 px-3 text-muted">{s.source_kind}</td>
                  <td className="py-2.5 px-3 font-mono text-xs text-muted">{s.api_key_prefix}</td>
                  <td className="py-2.5 px-3">
                    <span className={s.is_active ? "text-safe font-semibold" : "text-muted"}>
                      {s.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-muted">
                    {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : "Never"}
                  </td>
                  <td className="py-2.5 px-3">
                    {s.is_active && (
                      <button
                        onClick={() => handleDeactivate(s.id)}
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
          {sources.length === 0 && <EmptyState>No ingestion sources yet.</EmptyState>}
        </div>
      </main>
    </div>
  );
}
