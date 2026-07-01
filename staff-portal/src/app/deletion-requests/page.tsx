"use client";
import { useEffect, useState, useCallback } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import Badge from "@/components/Badge";
import StatCard from "@/components/StatCard";
import {
  getDeletionQueue, approveTenantDeletion, rejectTenantDeletion,
  DeletionQueueItem, ApiError,
} from "@/lib/api-client";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function ConfirmModal({
  item, action, onClose, onDone,
}: {
  item: DeletionQueueItem;
  action: "approve" | "reject";
  onClose: () => void;
  onDone: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isApprove = action === "approve";
  const keyword = isApprove ? "CONFIRM DELETE" : "REJECT";

  async function submit() {
    if (confirm !== keyword) return;
    setBusy(true); setErr(null);
    try {
      if (isApprove) await approveTenantDeletion(item.id);
      else await rejectTenantDeletion(item.id);
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof ApiError ? e.message : "Action failed.");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-panel border border-border rounded-2xl shadow-2xl">
        <div className={`px-6 py-5 border-b border-border ${isApprove ? "bg-danger/5" : "bg-safe/5"}`}>
          <h2 className={`text-base font-bold ${isApprove ? "text-danger" : "text-safe"}`}>
            {isApprove ? "Approve Permanent Deletion" : "Reject & Reactivate Account"}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            {isApprove
              ? "This action is irreversible. All tenant data will be permanently destroyed."
              : "The client's account will be reactivated and they'll regain full access."}
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-surface border border-border rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Tenant</span>
              <span className="font-semibold text-text">{item.name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Users at risk</span>
              <span className={`font-mono font-bold ${isApprove ? "text-danger" : "text-safe"}`}>{item.user_count}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Requested</span>
              <span className="text-text">{timeAgo(item.deletion_requested_at)}</span>
            </div>
            {item.deletion_reason && (
              <div className="pt-1 border-t border-border">
                <p className="text-xs text-muted italic">"{item.deletion_reason}"</p>
              </div>
            )}
          </div>

          {isApprove && (
            <div className="bg-danger/5 border border-danger/20 rounded-lg px-3 py-2 space-y-1">
              <p className="text-xs font-semibold text-danger">This will permanently delete:</p>
              <ul className="text-xs text-muted list-disc list-inside space-y-0.5">
                <li>All {item.user_count} user account(s)</li>
                <li>All API keys</li>
                <li>All support notes</li>
                <li>The tenant record itself</li>
              </ul>
              <p className="text-[10px] text-muted pt-1">Audit events are retained for compliance.</p>
            </div>
          )}

          {err && <p className="text-sm text-danger">{err}</p>}

          <div>
            <p className="text-xs text-muted mb-1.5">
              Type <strong>{keyword}</strong> to proceed:
            </p>
            <input
              className="w-full bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
              placeholder={keyword}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.toUpperCase())}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={submit}
              disabled={busy || confirm !== keyword}
              className={`flex-1 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40 transition-colors text-white ${
                isApprove ? "bg-danger hover:bg-danger/90" : "bg-safe hover:bg-safe/90"
              }`}
            >
              {busy ? "Processing…" : isApprove ? "Permanently Delete" : "Reactivate Account"}
            </button>
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-text transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DeletionRequestsPage() {
  const ready = useRequireAuth();
  const [queue, setQueue] = useState<DeletionQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ item: DeletionQueueItem; action: "approve" | "reject" } | null>(null);

  const load = useCallback(async () => {
    try {
      setQueue(await getDeletionQueue());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load deletion queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  function handleDone() {
    setModal(null);
    load();
  }

  if (!ready) return null;

  return (
    <>
      {modal && (
        <ConfirmModal
          item={modal.item}
          action={modal.action}
          onClose={() => setModal(null)}
          onDone={handleDone}
        />
      )}
      <AppShell>
        <main className="p-8 space-y-8 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">Account Deletion Queue</h1>
            <p className="text-sm text-muted mt-1">
              Tenants awaiting permanent deletion. Review and approve or reject each request.
            </p>
          </div>

          {error && (
            <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Pending Requests" value={queue.length} tone={queue.length > 0 ? "danger" : "safe"} />
            <StatCard label="Total Users Affected" value={queue.reduce((s, i) => s + i.user_count, 0)} tone="warn" />
            <StatCard label="Oldest Request" value={queue.length > 0 ? timeAgo(queue[0].deletion_requested_at) : "—"} tone="muted" />
          </div>

          <Panel>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold text-text">Pending Deletion Requests</p>
              <button onClick={load} className="text-xs text-muted hover:text-text transition-colors">Refresh</button>
            </div>
            {loading ? (
              <div className="px-6 py-10 text-center text-muted text-sm">Loading…</div>
            ) : queue.length === 0 ? (
              <div className="px-6 py-16 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-safe/10 flex items-center justify-center mx-auto">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-safe">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold text-text">No pending deletion requests</p>
                <p className="text-xs text-muted">All accounts are in good standing.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {queue.map((item) => (
                  <div key={item.id} className="px-6 py-5">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-xl bg-danger/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-danger">{item.name.slice(0, 2).toUpperCase()}</span>
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-text">{item.name}</p>
                          <Badge variant="suspended">Pending Deletion</Badge>
                        </div>
                        <p className="text-xs text-muted font-mono mt-0.5">{item.slug}</p>
                        {item.contact_email && (
                          <p className="text-xs text-muted mt-0.5">
                            Contact: <a href={`mailto:${item.contact_email}`} className="text-accent hover:underline">{item.contact_email}</a>
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                          <span>{item.user_count} user{item.user_count !== 1 ? "s" : ""}</span>
                          <span>Requested {timeAgo(item.deletion_requested_at)}</span>
                          <span className="text-danger font-medium">
                            {new Date(item.deletion_requested_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                          </span>
                        </div>
                        {item.deletion_reason && (
                          <p className="text-xs text-muted italic mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 max-w-xl">
                            "{item.deletion_reason}"
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setModal({ item, action: "reject" })}
                          className="text-xs px-3 py-1.5 rounded-lg bg-safe/10 border border-safe/20 text-safe hover:bg-safe/20 font-semibold transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => setModal({ item, action: "approve" })}
                          className="text-xs px-3 py-1.5 rounded-lg bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 font-semibold transition-colors"
                        >
                          Approve Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="bg-surface border border-border rounded-xl px-6 py-4 text-sm text-muted space-y-1">
            <p className="font-semibold text-text text-xs uppercase tracking-wider">Policy reminder</p>
            <p>Approving deletion permanently removes all tenant users, API keys, and tenant record. Audit events are retained for compliance. This action cannot be undone.</p>
            <p>Rejecting a deletion reactivates the account — the client will regain full access immediately.</p>
          </div>
        </main>
      </AppShell>
    </>
  );
}
