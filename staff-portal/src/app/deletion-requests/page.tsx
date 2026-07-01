"use client";
import { useEffect, useState, useCallback } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import Badge from "@/components/Badge";
import StatCard from "@/components/StatCard";
import {
  getDeletionQueue, approveTenantDeletion, rejectTenantDeletion, executeScheduledDeletion,
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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

type ModalMode = "approve" | "reject" | "execute";

function SecurityModal({
  item, mode, onClose, onDone,
}: {
  item: DeletionQueueItem;
  mode: ModalMode;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isApprove = mode === "approve";
  const isReject = mode === "reject";
  const isExecute = mode === "execute";

  const title = isApprove
    ? "Approve Deletion Request"
    : isReject
    ? "Reject & Reactivate Account"
    : "Execute Scheduled Deletion";

  const accentClass = isReject ? "text-safe" : "text-danger";
  const bgClass = isReject ? "bg-safe/5" : "bg-danger/5";
  const btnClass = isReject ? "bg-safe hover:bg-safe/90" : "bg-danger hover:bg-danger/90";
  const btnLabel = isApprove
    ? scheduleDate ? "Schedule Deletion" : "Delete Immediately"
    : isReject
    ? "Reject & Reactivate"
    : "Execute Deletion Now";

  const canSubmit = password.length >= 8 && reason.trim().length >= 10;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      if (isApprove) {
        await approveTenantDeletion(item.id, password, reason, scheduleDate || undefined);
      } else if (isReject) {
        await rejectTenantDeletion(item.id, password, reason);
      } else {
        await executeScheduledDeletion(item.id, password, reason);
      }
      onDone();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 401) {
        setErr("Incorrect password. Please try again.");
      } else {
        setErr(e instanceof ApiError ? e.message : "Action failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-panel border border-border rounded-2xl shadow-2xl">

        {/* Header */}
        <div className={`px-6 py-5 border-b border-border ${bgClass} rounded-t-2xl`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isReject ? "bg-safe/20" : "bg-danger/20"}`}>
              {isReject ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-safe">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              )}
            </div>
            <div>
              <h2 className={`text-sm font-bold ${accentClass}`}>{title}</h2>
              <p className="text-xs text-muted mt-0.5">Tenant: <strong className="text-text">{item.name}</strong></p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Tenant summary */}
          <div className="bg-surface border border-border rounded-xl px-4 py-3 grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Slug</p>
              <p className="text-xs font-mono text-text">{item.slug}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Users at risk</p>
              <p className={`text-xs font-bold ${isReject ? "text-safe" : "text-danger"}`}>{item.user_count}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Requested</p>
              <p className="text-xs text-text">{timeAgo(item.deletion_requested_at)}</p>
            </div>
            {item.contact_email && (
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider">Contact</p>
                <p className="text-xs text-accent truncate">{item.contact_email}</p>
              </div>
            )}
          </div>

          {item.deletion_reason && (
            <div className="bg-surface border border-border rounded-lg px-3 py-2">
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Client reason</p>
              <p className="text-xs text-muted italic">"{item.deletion_reason}"</p>
            </div>
          )}

          {/* Irreversible warning for approve/execute */}
          {!isReject && (
            <div className="bg-danger/5 border border-danger/20 rounded-lg px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-danger">Permanently destroys:</p>
              <ul className="text-xs text-muted list-disc list-inside space-y-0.5">
                <li>All {item.user_count} user account(s)</li>
                <li>All API keys and access tokens</li>
                <li>All support notes and history</li>
                <li>The tenant record itself</li>
              </ul>
              <p className="text-[10px] text-muted pt-0.5">Audit events are retained for compliance. This cannot be undone.</p>
            </div>
          )}

          {/* Schedule date (approve only) */}
          {isApprove && (
            <div>
              <label className="block text-xs text-muted mb-1.5">
                Schedule deletion date <span className="text-accent">(optional — leave blank to delete immediately)</span>
              </label>
              <input
                type="datetime-local"
                className="w-full bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-xs text-muted mb-1.5">
              Staff reason / notes <span className="text-danger">*</span>
              <span className="text-muted ml-1">(min. 10 characters)</span>
            </label>
            <textarea
              rows={3}
              className="w-full bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60 resize-none"
              placeholder="Document your decision and any relevant context…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-[10px] text-muted mt-1">{reason.length} chars</p>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs text-muted mb-1.5">
              Your admin password <span className="text-danger">*</span>
            </label>
            <input
              type="password"
              className="w-full bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
              placeholder="Enter your password to authorize"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }}
            />
          </div>

          {err && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-xs text-danger">{err}</div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={submit}
              disabled={busy || !canSubmit}
              className={`flex-1 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40 transition-colors text-white ${btnClass}`}
            >
              {busy ? "Processing…" : btnLabel}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-text transition-colors"
            >
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
  const [modal, setModal] = useState<{ item: DeletionQueueItem; mode: ModalMode } | null>(null);

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

  const scheduled = queue.filter((i) => i.scheduled_deletion_at);
  const pending = queue.filter((i) => !i.scheduled_deletion_at);

  if (!ready) return null;

  return (
    <>
      {modal && (
        <SecurityModal
          item={modal.item}
          mode={modal.mode}
          onClose={() => setModal(null)}
          onDone={handleDone}
        />
      )}
      <AppShell>
        <main className="p-8 space-y-8 animate-fade-in">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text tracking-tight">Account Deletion Queue</h1>
              <p className="text-sm text-muted mt-1">
                Review and authorize or reject tenant deletion requests. All actions require your password and are logged.
              </p>
            </div>
            <button onClick={load} className="text-xs text-muted hover:text-text transition-colors px-3 py-1.5 border border-border rounded-lg">
              Refresh
            </button>
          </div>

          {error && (
            <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Pending Review" value={pending.length} tone={pending.length > 0 ? "danger" : "safe"} />
            <StatCard label="Scheduled" value={scheduled.length} tone={scheduled.length > 0 ? "warn" : "muted"} />
            <StatCard label="Total Users Affected" value={queue.reduce((s, i) => s + i.user_count, 0)} tone="warn" />
            <StatCard label="Oldest Request" value={queue.length > 0 ? timeAgo(queue[0].deletion_requested_at) : "—"} tone="muted" />
          </div>

          {/* Scheduled deletions */}
          {scheduled.length > 0 && (
            <Panel>
              <div className="px-6 py-4 border-b border-border">
                <p className="text-sm font-semibold text-warn">Scheduled Deletions</p>
                <p className="text-xs text-muted">These tenants have an approved deletion date set.</p>
              </div>
              <div className="divide-y divide-border/60">
                {scheduled.map((item) => (
                  <div key={item.id} className="px-6 py-4 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-warn/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-warn">{item.name.slice(0, 2).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-text">{item.name}</p>
                      <p className="text-xs text-muted font-mono">{item.slug}</p>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-muted">
                        <span>{item.user_count} users</span>
                        <span className="text-warn font-semibold">
                          Scheduled: {item.scheduled_deletion_at ? fmtDate(item.scheduled_deletion_at) : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setModal({ item, mode: "reject" })}
                        className="text-xs px-3 py-1.5 rounded-lg bg-safe/10 border border-safe/20 text-safe hover:bg-safe/20 font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => setModal({ item, mode: "execute" })}
                        className="text-xs px-3 py-1.5 rounded-lg bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 font-semibold transition-colors"
                      >
                        Execute Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Pending review */}
          <Panel>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-text">Pending Review</p>
                <p className="text-xs text-muted">Tenants awaiting staff approval or rejection.</p>
              </div>
              <Badge variant={pending.length > 0 ? "suspended" : "active"}>{pending.length} pending</Badge>
            </div>
            {loading ? (
              <div className="px-6 py-10 text-center text-muted text-sm">Loading…</div>
            ) : pending.length === 0 ? (
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
                {pending.map((item) => (
                  <div key={item.id} className="px-6 py-5">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-danger/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-danger">{item.name.slice(0, 2).toUpperCase()}</span>
                      </div>
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
                          <span className="text-danger font-medium">{fmtDate(item.deletion_requested_at)}</span>
                        </div>
                        {item.deletion_reason && (
                          <p className="text-xs text-muted italic mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 max-w-xl">
                            "{item.deletion_reason}"
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setModal({ item, mode: "reject" })}
                          className="text-xs px-3 py-1.5 rounded-lg bg-safe/10 border border-safe/20 text-safe hover:bg-safe/20 font-semibold transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => setModal({ item, mode: "approve" })}
                          className="text-xs px-3 py-1.5 rounded-lg bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 font-semibold transition-colors"
                        >
                          Review & Act
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
            <p>All actions require your admin password and a documented reason. Approvals are logged to the Staff Audit Log.</p>
            <p>You can schedule deletion for a future date, or execute immediately. Rejecting reactivates the account right away.</p>
          </div>
        </main>
      </AppShell>
    </>
  );
}
