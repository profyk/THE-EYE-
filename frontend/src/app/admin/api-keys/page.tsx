"use client";

import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getSession } from "@/lib/auth";
import {
  listApiKeys,
  createApiKey,
  updateApiKey,
  revokeApiKey,
  ApiKeyOut,
  ApiKeyCreated,
  ApiError,
} from "@/lib/api-client";

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(d: string | null) {
  if (!d) return "Never";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 transition-colors font-medium shrink-0"
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

// ── NewKeyModal ───────────────────────────────────────────────────────────────

function NewKeyModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (key: ApiKeyCreated) => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const key = await createApiKey(name.trim());
      onCreate(key);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create key.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-panel border border-border rounded-2xl shadow-2xl">
        <div className="px-6 py-5 border-b border-border">
          <h2 className="text-base font-semibold text-text">Generate API Key</h2>
          <p className="text-xs text-muted mt-0.5">
            Give this key a descriptive name (e.g. &quot;Production Server 1&quot;).
          </p>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">
              Key Name
            </label>
            <input
              autoFocus
              type="text"
              placeholder="e.g. Production Server"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={128}
              className="w-full bg-surface border border-border text-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors"
            />
          </div>
          {error && (
            <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg bg-surface text-muted text-sm hover:text-text border border-border transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-2.5 rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-void font-semibold text-sm transition-colors"
            >
              {loading ? "Generating…" : "Generate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── RevealKeyModal ────────────────────────────────────────────────────────────

function RevealKeyModal({
  apiKey,
  tenantId,
  onClose,
}: {
  apiKey: ApiKeyCreated;
  tenantId: string;
  onClose: () => void;
}) {
  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://your-backend.railway.app";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-xl bg-panel border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-border flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-safe/10 flex items-center justify-center shrink-0 mt-0.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-safe">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-text">API Key Generated</h2>
            <p className="text-xs text-muted mt-0.5">
              Copy these credentials now — the key will{" "}
              <strong className="text-warn">not</strong> be shown again.
            </p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="p-4 bg-danger/5 border border-danger/20 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-xs font-semibold text-danger uppercase tracking-wider">
                Save this key now
              </p>
            </div>
            <p className="text-xs text-muted">
              This is the only time the full key is visible. Store it in a secrets manager — we never show it again.
            </p>
          </div>

          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Tenant ID</p>
            <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2">
              <code className="flex-1 text-xs font-mono text-text break-all">{tenantId}</code>
              <CopyButton value={tenantId} />
            </div>
          </div>

          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">API Key</p>
            <div className="flex items-start gap-2 bg-surface border border-border rounded-lg px-3 py-2">
              <code className="flex-1 text-xs font-mono text-accent break-all">{apiKey.full_key}</code>
              <CopyButton value={apiKey.full_key} />
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
              Agent Environment Variables
            </p>
            <pre className="text-[11px] font-mono text-text whitespace-pre-wrap break-all leading-relaxed select-all">
{`THE_EYE_TENANT_ID=${tenantId}
THE_EYE_API_KEY=${apiKey.full_key}
THE_EYE_API_URL=${apiUrl}`}
            </pre>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent/90 text-void font-semibold text-sm transition-colors"
          >
            I&apos;ve saved these credentials
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ApiKeysPage() {
  const ready = useRequireAuth();
  const session = getSession();
  const tenantId = session?.tenant_id ?? "";

  const [keys, setKeys] = useState<ApiKeyOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setKeys(await listApiKeys());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load API keys.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function handleCreate(key: ApiKeyCreated) {
    setShowNew(false);
    setCreatedKey(key);
    await load();
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this API key? Agents using it will immediately lose access.")) return;
    setRevoking(id);
    try {
      await revokeApiKey(id);
      setKeys((ks) => ks.filter((k) => k.id !== id));
    } catch {
      alert("Failed to revoke key.");
    } finally {
      setRevoking(null);
    }
  }

  async function handleToggle(key: ApiKeyOut) {
    setToggling(key.id);
    try {
      const updated = await updateApiKey(key.id, { is_active: !key.is_active });
      setKeys((ks) => ks.map((k) => (k.id === updated.id ? updated : k)));
    } catch {
      alert("Failed to update key.");
    } finally {
      setToggling(null);
    }
  }

  if (!ready) return null;

  return (
    <NavBar>
      {showNew && (
        <NewKeyModal onClose={() => setShowNew(false)} onCreate={handleCreate} />
      )}
      {createdKey && tenantId && (
        <RevealKeyModal
          apiKey={createdKey}
          tenantId={tenantId}
          onClose={() => setCreatedKey(null)}
        />
      )}

      <div className="p-8 max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">API Keys</h1>
            <p className="text-sm text-muted mt-1">
              Generate keys for THE EYE Agent to authenticate from your machines.
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="shrink-0 flex items-center gap-2 bg-accent hover:bg-accent/90 text-void font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Generate Key
          </button>
        </div>

        {/* Tenant ID banner */}
        {tenantId && (
          <div className="flex items-center gap-4 bg-accent/5 border border-accent/20 rounded-xl px-5 py-4">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">
                Your Tenant ID
              </p>
              <p className="text-sm font-mono text-text break-all">{tenantId}</p>
            </div>
            <CopyButton value={tenantId} label="Copy ID" />
          </div>
        )}

        {/* Setup guide */}
        <Panel>
          <div className="px-6 py-4 border-b border-border">
            <p className="text-sm font-semibold text-text">Agent Setup</p>
          </div>
          <div className="px-6 py-5 space-y-2 text-sm text-muted">
            <p>THE EYE Agent authenticates with two values sent as HTTP headers:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>
                <code className="text-text font-mono text-xs bg-surface px-1.5 py-0.5 rounded border border-border">
                  X-Tenant-ID
                </code>{" "}
                — your Tenant ID shown above
              </li>
              <li>
                <code className="text-text font-mono text-xs bg-surface px-1.5 py-0.5 rounded border border-border">
                  X-Api-Key
                </code>{" "}
                — an API key you generate below
              </li>
            </ul>
            <p className="pt-1">
              Set these as environment variables on each machine running the agent. Rotate keys
              without downtime by creating a new key before revoking the old one.
            </p>
          </div>
        </Panel>

        {error && (
          <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Key list */}
        <Panel>
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-text">API Keys</p>
            <p className="text-xs text-muted">{keys.length} / 20</p>
          </div>

          {loading ? (
            <div className="px-6 py-10 text-center text-muted text-sm">Loading…</div>
          ) : keys.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center mx-auto mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                  <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <p className="text-sm text-muted">No API keys yet.</p>
              <p className="text-xs text-muted mt-1">
                Generate your first key to start connecting agents.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className={`px-6 py-4 flex items-center gap-4 transition-colors ${
                    !key.is_active ? "opacity-50" : "hover:bg-surface/30"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-text">{key.name}</p>
                      {!key.is_active && (
                        <span className="text-[10px] bg-muted/10 text-muted border border-muted/20 rounded px-1.5 py-0.5 uppercase tracking-wider font-semibold">
                          Disabled
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                      <code className="font-mono text-text/70">{key.key_prefix}…</code>
                      <span>Last used: {timeAgo(key.last_used_at)}</span>
                      <span>Created {fmtDate(key.created_at)}</span>
                      {key.created_by_username && (
                        <span>by {key.created_by_username}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(key)}
                      disabled={toggling === key.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-surface hover:bg-surface/80 text-muted hover:text-text border border-border transition-colors"
                    >
                      {toggling === key.id ? "…" : key.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => handleRevoke(key.id)}
                      disabled={revoking === key.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-danger/5 hover:bg-danger/10 text-danger border border-danger/20 transition-colors"
                    >
                      {revoking === key.id ? "…" : "Revoke"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </NavBar>
  );
}
