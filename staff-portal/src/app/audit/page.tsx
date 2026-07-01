"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import { getAuditLog, getAuditLogStats, AuditLogEntry, AuditLogStats, ApiError } from "@/lib/api-client";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    "tenant.deletion.approved": "Deletion Approved",
    "tenant.deletion.rejected": "Deletion Rejected",
    "tenant.deletion.scheduled": "Deletion Scheduled",
    "tenant.deletion.executed": "Deletion Executed",
  };
  return map[action] ?? action.split(".").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" → ");
}

// ── Severity pill ─────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: "bg-danger/15 text-danger border-danger/30",
    warning:  "bg-warn/15 text-warn border-warn/30",
    info:     "bg-accent/10 text-accent border-accent/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${styles[severity] ?? styles.info}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${severity === "critical" ? "bg-danger" : severity === "warning" ? "bg-warn" : "bg-accent"}`} />
      {severity}
    </span>
  );
}

// ── Action icon ───────────────────────────────────────────────────────────────

function ActionIcon({ action, severity }: { action: string; severity: string }) {
  const isCritical = severity === "critical";
  const isWarning = severity === "warning";
  const colorClass = isCritical ? "bg-danger/15 text-danger" : isWarning ? "bg-warn/15 text-warn" : "bg-accent/10 text-accent";

  const icon = action.includes("deletion") ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
    </svg>
  ) : action.includes("suspend") || action.includes("ban") ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
    </svg>
  ) : action.includes("activate") || action.includes("approve") ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ) : action.includes("create") || action.includes("add") ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );

  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
      {icon}
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function DetailModal({ entry, onClose }: { entry: AuditLogEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-lg mx-4 bg-panel border border-border rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-text">{actionLabel(entry.action)}</h2>
            <p className="text-xs text-muted mt-0.5">{fmtDateTime(entry.occurred_at)}</p>
          </div>
          <div className="flex items-center gap-2">
            <SeverityBadge severity={entry.severity} />
            <button onClick={onClose} className="text-muted hover:text-text transition-colors p-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Actor" value={entry.actor_username} />
            <Field label="Action" value={entry.action} mono />
            {entry.target_type && <Field label="Target Type" value={entry.target_type} />}
            {entry.target_name && <Field label="Target Name" value={entry.target_name} />}
            {entry.target_id && <Field label="Target ID" value={entry.target_id} mono />}
          </div>
          {entry.reason && (
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Reason / Notes</p>
              <p className="text-sm text-text bg-surface border border-border rounded-lg px-3 py-2 italic">"{entry.reason}"</p>
            </div>
          )}
          {entry.details && Object.keys(entry.details).length > 0 && (
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Details</p>
              <pre className="text-xs text-text bg-void border border-border rounded-lg px-3 py-2 overflow-auto max-h-40">
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-xs text-text truncate ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SEVERITY_OPTS = [
  { label: "All Levels", value: "" },
  { label: "Critical", value: "critical" },
  { label: "Warning", value: "warning" },
  { label: "Info", value: "info" },
];

export default function AuditPage() {
  const ready = useRequireAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  // Filters
  const [severity, setSeverity] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (sv: string, act: string, actor: string) => {
    setLoading(true);
    try {
      const [entries, s] = await Promise.all([
        getAuditLog({ limit: 200, severity: sv || undefined, action: act || undefined, actor: actor || undefined }),
        getAuditLogStats(),
      ]);
      setLogs(entries);
      setStats(s);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load audit log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(severity, actionFilter, actorFilter), 300);
  }, [ready, severity, actionFilter, actorFilter, load]);

  if (!ready) return null;

  return (
    <>
      {detail && <DetailModal entry={detail} onClose={() => setDetail(null)} />}
      <AppShell>
        <main className="p-8 space-y-8 animate-fade-in">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text tracking-tight">Staff Audit Log</h1>
              <p className="text-sm text-muted mt-1">
                Every administrative action is recorded with actor, target, reason, and timestamp. Immutable record.
              </p>
            </div>
            <button
              onClick={() => load(severity, actionFilter, actorFilter)}
              className="text-xs text-muted hover:text-text transition-colors px-3 py-1.5 border border-border rounded-lg"
            >
              Refresh
            </button>
          </div>

          {error && (
            <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>
          )}

          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-5 gap-4">
              <StatTile label="Total Events" value={stats.total} />
              <StatTile label="Last 24h" value={stats.last_24h} color="text-accent" />
              <StatTile label="Critical" value={stats.critical} color="text-danger" />
              <StatTile label="Warning" value={stats.warning} color="text-warn" />
              <StatTile label="Info" value={stats.info} color="text-accent" />
            </div>
          )}

          {/* Top actions breakdown */}
          {stats && stats.actions_breakdown.length > 0 && (
            <div className="grid grid-cols-2 gap-6">
              <Panel>
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-xs font-semibold text-text uppercase tracking-wider">Top Actions</p>
                </div>
                <div className="px-5 py-3 space-y-2">
                  {stats.actions_breakdown.map((row, i) => {
                    const pct = stats.total > 0 ? Math.round((row.count / stats.total) * 100) : 0;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-mono text-muted">{row.action}</span>
                          <span className="text-xs font-semibold text-text">{row.count}</span>
                        </div>
                        <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                          <div className="h-full bg-accent/50 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              {/* Severity distribution */}
              <Panel>
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-xs font-semibold text-text uppercase tracking-wider">Severity Distribution</p>
                </div>
                <div className="px-5 py-4 flex items-center justify-center gap-8">
                  {[
                    { label: "Critical", value: stats.critical, color: "var(--danger)" },
                    { label: "Warning", value: stats.warning, color: "var(--warn)" },
                    { label: "Info", value: stats.info, color: "var(--accent)" },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-xs text-muted mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-3 py-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="bg-transparent text-sm text-text focus:outline-none placeholder:text-muted w-36"
                placeholder="Filter by action…"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-3 py-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <input
                className="bg-transparent text-sm text-text focus:outline-none placeholder:text-muted w-32"
                placeholder="Filter by actor…"
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {SEVERITY_OPTS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSeverity(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    severity === opt.value
                      ? opt.value === "critical"
                        ? "bg-danger/20 text-danger border border-danger/40"
                        : opt.value === "warning"
                        ? "bg-warn/20 text-warn border border-warn/40"
                        : opt.value === "info"
                        ? "bg-accent/20 text-accent border border-accent/40"
                        : "bg-accent/15 text-accent border border-accent/30"
                      : "bg-surface border border-border text-muted hover:text-text"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted ml-auto">{logs.length} event{logs.length !== 1 ? "s" : ""}</p>
          </div>

          {/* Timeline feed */}
          <Panel>
            <div className="px-6 py-4 border-b border-border">
              <p className="text-sm font-semibold text-text">Event Timeline</p>
              <p className="text-xs text-muted">Click any row for full details. All times are UTC.</p>
            </div>
            {loading ? (
              <div className="px-6 py-12 text-center text-muted text-sm">Loading audit log…</div>
            ) : logs.length === 0 ? (
              <div className="px-6 py-16 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mx-auto">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold text-text">No events found</p>
                <p className="text-xs text-muted">Adjust filters or wait for staff activity to appear.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {logs.map((entry, i) => (
                  <button
                    key={entry.id}
                    onClick={() => setDetail(entry)}
                    className="w-full px-6 py-4 flex items-start gap-4 hover:bg-surface/60 transition-colors text-left group"
                  >
                    {/* Timeline line */}
                    <div className="flex flex-col items-center shrink-0 mt-0.5">
                      <ActionIcon action={entry.action} severity={entry.severity} />
                      {i < logs.length - 1 && <div className="w-px flex-1 bg-border/50 mt-1.5 min-h-4" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-text group-hover:text-accent transition-colors">
                          {actionLabel(entry.action)}
                        </p>
                        <SeverityBadge severity={entry.severity} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted flex-wrap">
                        <span className="flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                          </svg>
                          <strong className="text-text">{entry.actor_username}</strong>
                        </span>
                        {entry.target_name && (
                          <span className="flex items-center gap-1">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                            </svg>
                            {entry.target_name}
                          </span>
                        )}
                        <span className="ml-auto text-[11px]">{timeAgo(entry.occurred_at)}</span>
                      </div>
                      {entry.reason && (
                        <p className="text-xs text-muted italic mt-1 line-clamp-1">"{entry.reason}"</p>
                      )}
                    </div>

                    {/* Chevron */}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </main>
      </AppShell>
    </>
  );
}

function StatTile({ label, value, color = "text-text" }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-panel border border-border rounded-xl px-5 py-4">
      <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}
