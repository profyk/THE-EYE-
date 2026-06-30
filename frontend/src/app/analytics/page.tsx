"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getAnalytics, ApiError, AnalyticsData } from "@/lib/api-client";

// ── Color maps ────────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--danger)",
  high:     "var(--warn)",
  warning:  "var(--warn)",
  info:     "var(--accent)",
  low:      "var(--safe)",
  debug:    "var(--muted)",
};

const OUTCOME_COLOR: Record<string, string> = {
  success: "var(--safe)",
  failure: "var(--danger)",
  denied:  "var(--warn)",
  unknown: "var(--muted)",
};

const CATEGORY_COLOR: Record<string, string> = {
  authentication:       "var(--accent)",
  authorization:        "var(--iris)",
  data_access:          "var(--warn)",
  data_modification:    "var(--danger)",
  configuration:        "var(--safe)",
  process_execution:    "var(--muted)",
  network:              "var(--accent-dim)",
  financial_transaction:"var(--warn)",
  administrative:       "var(--iris)",
  system:               "var(--muted)",
};

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString();
}

function fmtLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[var(--surface)] ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-52" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KPI({
  label, value, sub, tone = "accent",
}: {
  label: string; value: string | number; sub?: string; tone?: "accent"|"danger"|"warn"|"safe"|"iris"|"muted";
}) {
  const colors: Record<string, { border: string; text: string; glow: string }> = {
    accent: { border: "border-l-[var(--accent)]",  text: "text-[var(--accent)]",  glow: "bg-[var(--accent)]/5"  },
    danger: { border: "border-l-[var(--danger)]",  text: "text-[var(--danger)]",  glow: "bg-[var(--danger)]/5"  },
    warn:   { border: "border-l-[var(--warn)]",    text: "text-[var(--warn)]",    glow: "bg-[var(--warn)]/5"    },
    safe:   { border: "border-l-[var(--safe)]",    text: "text-[var(--safe)]",    glow: "bg-[var(--safe)]/5"    },
    iris:   { border: "border-l-[var(--iris)]",    text: "text-[var(--iris)]",    glow: "bg-[var(--iris)]/5"    },
    muted:  { border: "border-l-[var(--muted)]",   text: "text-[var(--muted)]",   glow: "bg-[var(--surface)]"   },
  };
  const c = colors[tone];
  return (
    <div className={`rounded-xl border border-[var(--border)] border-l-4 ${c.border} ${c.glow} px-5 py-4`}>
      <p className="text-[10px] text-[var(--muted)] uppercase tracking-[0.14em] font-bold mb-2">{label}</p>
      <p className={`text-3xl font-extrabold font-mono leading-none ${c.text}`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--muted)] mt-2 leading-tight">{sub}</p>}
    </div>
  );
}

// ── Day volume bar chart ──────────────────────────────────────────────────────

function DayBarChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-36 text-[var(--muted)]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-40">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
        <p className="text-sm">No events in the last 30 days</p>
      </div>
    );
  }
  const max = Math.max(...data.map(d => d.count), 1);
  const showTick = (i: number) => data.length <= 15 || i % Math.ceil(data.length / 12) === 0;

  return (
    <div className="flex items-end gap-0.5 h-36" role="img" aria-label="Events per day">
      {data.map((d, i) => {
        const pct = Math.max(2, (d.count / max) * 100);
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group cursor-default" title={`${d.date}: ${d.count.toLocaleString()} events`}>
            <div className="relative w-full flex items-end" style={{ height: "120px" }}>
              <div
                className="w-full rounded-t-sm transition-all duration-200 group-hover:opacity-100 opacity-70"
                style={{ height: `${pct}%`, backgroundColor: "var(--accent)" }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                <div className="bg-[var(--void)] border border-[var(--border)] rounded-lg px-2 py-1 text-[10px] font-mono text-[var(--text)] whitespace-nowrap shadow-lg">
                  {d.count.toLocaleString()}
                </div>
                <div className="w-1.5 h-1.5 rotate-45 bg-[var(--void)] border-r border-b border-[var(--border)] -mt-1" />
              </div>
            </div>
            {showTick(i) && (
              <p className="text-[8px] text-[var(--muted)] font-mono leading-none">{d.date.slice(5)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Horizontal bar row ────────────────────────────────────────────────────────

function HBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 group">
      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
      <span className="flex-1 min-w-0 text-sm text-[var(--text)] truncate" title={fmtLabel(label)}>
        {fmtLabel(label)}
      </span>
      <div className="w-32 h-2 rounded-full bg-[var(--surface)] overflow-hidden shrink-0">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-14 text-right text-xs font-mono text-[var(--muted)] shrink-0">
        {fmt(count)} <span className="text-[10px] opacity-60">({pct.toFixed(0)}%)</span>
      </span>
    </div>
  );
}

// ── Severity dot list ─────────────────────────────────────────────────────────

function SeverityRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="flex-1 text-sm text-[var(--text)] capitalize">{label}</span>
      <div className="w-24 h-1.5 rounded-full bg-[var(--surface)] overflow-hidden shrink-0">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 text-right text-xs font-mono text-[var(--muted)] shrink-0">{fmt(count)}</span>
    </div>
  );
}

// ── Hour heatmap ──────────────────────────────────────────────────────────────

function HourHeatmap({ data }: { data: { hour: number; count: number }[] }) {
  const filled: number[] = Array(24).fill(0);
  data.forEach(d => { filled[d.hour] = d.count; });
  const max = Math.max(...filled, 1);

  return (
    <div>
      <div className="flex gap-0.5">
        {filled.map((count, hour) => {
          const intensity = count / max;
          return (
            <div
              key={hour}
              className="flex-1 rounded-sm cursor-default group relative"
              style={{
                height: "32px",
                backgroundColor: `color-mix(in srgb, var(--iris) ${Math.round(intensity * 80 + (count > 0 ? 8 : 0))}%, var(--surface))`,
              }}
              title={`${String(hour).padStart(2, "0")}:00 — ${count.toLocaleString()} events`}
            />
          );
        })}
      </div>
      <div className="flex mt-2">
        {[0, 6, 12, 18, 23].map(h => (
          <div key={h} className="text-[9px] text-[var(--muted)] font-mono" style={{ marginLeft: h === 0 ? 0 : `${(h / 24) * 100}%` }}>
            {String(h).padStart(2, "0")}h
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Top event types ranked list ───────────────────────────────────────────────

function RankedList({ items }: { items: { label: string; count: number; pct: number }[] }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-3 group">
          <span className="text-[10px] font-bold text-[var(--muted)] font-mono w-4 text-right shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0 relative">
            <div
              className="absolute inset-y-0 left-0 rounded-md opacity-20 transition-all"
              style={{ width: `${item.pct}%`, backgroundColor: "var(--accent)" }}
            />
            <p className="relative text-sm text-[var(--text)] font-mono px-2 py-1 truncate" title={item.label}>
              {item.label}
            </p>
          </div>
          <span className="text-sm font-mono font-semibold text-[var(--accent)] shrink-0 w-16 text-right">
            {fmt(item.count)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--muted)] mb-4">{children}</p>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const ready = useRequireAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    getAnalytics()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  const totalEvents    = data?.total_events ?? 0;
  const criticalCount  = data?.events_by_severity.find(r => r.severity === "critical")?.count ?? 0;
  const failureCount   = data?.outcome_breakdown.find(r => r.outcome === "failure" || r.outcome === "denied")?.count ?? 0;
  const catTotal       = data?.events_by_category.reduce((s, r) => s + r.count, 0) ?? 1;
  const sevTotal       = data?.events_by_severity.reduce((s, r) => s + r.count, 0) ?? 1;
  const outcomeTotal   = data?.outcome_breakdown.reduce((s, r) => s + r.count, 0) ?? 1;
  const typeTotal      = data?.top_event_types.reduce((s, r) => s + r.count, 0) ?? 1;

  const peakDay  = data?.events_by_day.reduce((a, b) => b.count > a.count ? b : a, { date: "—", count: 0 });
  const peakHour = data?.activity_by_hour.reduce((a, b) => b.count > a.count ? b : a, { hour: 0, count: 0 });

  const topTypes = (data?.top_event_types ?? []).slice(0, 10).map(r => ({
    label: r.event_type,
    count: r.count,
    pct: typeTotal > 0 ? (r.count / typeTotal) * 100 : 0,
  }));

  return (
    <NavBar>
      <main className="p-6 md:p-8 flex-1 max-w-6xl space-y-8 animate-fade-in">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Analytics</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Event intelligence across your audit ledger — last 30 days.</p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-xl px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-sm text-[var(--danger)]">{error}</p>
          </div>
        )}

        {loading && <LoadingSkeleton />}

        {data && !loading && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPI
                label="Total Events"
                value={fmt(totalEvents)}
                sub="recorded in last 30 days"
                tone="accent"
              />
              <KPI
                label="Critical Events"
                value={fmt(criticalCount)}
                sub={criticalCount > 0 ? `${((criticalCount / Math.max(totalEvents,1)) * 100).toFixed(1)}% of total` : "none detected"}
                tone={criticalCount > 0 ? "danger" : "safe"}
              />
              <KPI
                label="Failures / Denied"
                value={fmt(failureCount)}
                sub={failureCount > 0 ? `${((failureCount / Math.max(totalEvents,1)) * 100).toFixed(1)}% of total` : "none detected"}
                tone={failureCount > 0 ? "warn" : "safe"}
              />
              <KPI
                label="Peak Hour"
                value={peakHour ? `${String(peakHour.hour).padStart(2, "0")}:00` : "—"}
                sub={peakHour?.count ? `${fmt(peakHour.count)} events at peak` : ""}
                tone="iris"
              />
            </div>

            {/* Volume chart */}
            <Panel className="p-6">
              <SectionTitle>Event Volume — Last 30 Days</SectionTitle>
              <DayBarChart data={data.events_by_day} />
              {peakDay && peakDay.count > 0 && (
                <p className="text-[10px] text-[var(--muted)] mt-3">
                  Peak day: <span className="font-mono text-[var(--text)]">{peakDay.date}</span> with <span className="font-mono text-[var(--accent)]">{peakDay.count.toLocaleString()}</span> events
                </p>
              )}
            </Panel>

            {/* Category + Severity/Outcome */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              <Panel className="p-6">
                <SectionTitle>By Category</SectionTitle>
                {data.events_by_category.length === 0 ? (
                  <p className="text-sm text-[var(--muted)] text-center py-6">No data available.</p>
                ) : (
                  <div className="space-y-3">
                    {data.events_by_category.map(r => (
                      <HBar
                        key={r.category}
                        label={r.category}
                        count={r.count}
                        total={catTotal}
                        color={CATEGORY_COLOR[r.category] ?? "var(--muted)"}
                      />
                    ))}
                  </div>
                )}
              </Panel>

              <div className="space-y-5">
                <Panel className="p-6">
                  <SectionTitle>By Severity</SectionTitle>
                  {data.events_by_severity.length === 0 ? (
                    <p className="text-sm text-[var(--muted)] text-center py-4">No data available.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.events_by_severity.map(r => (
                        <SeverityRow
                          key={r.severity}
                          label={r.severity}
                          count={r.count}
                          total={sevTotal}
                          color={SEVERITY_COLOR[r.severity] ?? "var(--muted)"}
                        />
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel className="p-6">
                  <SectionTitle>By Outcome</SectionTitle>
                  {data.outcome_breakdown.length === 0 ? (
                    <p className="text-sm text-[var(--muted)] text-center py-4">No data available.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.outcome_breakdown.map(r => (
                        <SeverityRow
                          key={r.outcome}
                          label={r.outcome}
                          count={r.count}
                          total={outcomeTotal}
                          color={OUTCOME_COLOR[r.outcome] ?? "var(--muted)"}
                        />
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
            </div>

            {/* Top event types */}
            {topTypes.length > 0 && (
              <Panel className="p-6">
                <SectionTitle>Top Event Types</SectionTitle>
                <RankedList items={topTypes} />
              </Panel>
            )}

            {/* Activity heatmap */}
            {data.activity_by_hour.length > 0 && (
              <Panel className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <SectionTitle>Activity by Hour of Day</SectionTitle>
                  <span className="text-[10px] text-[var(--muted)] -mt-1">All time · UTC</span>
                </div>
                <HourHeatmap data={data.activity_by_hour} />
                {peakHour && (
                  <p className="text-[10px] text-[var(--muted)] mt-3">
                    Most active hour: <span className="font-mono text-[var(--iris)]">{String(peakHour.hour).padStart(2, "0")}:00</span>
                    {" "}with <span className="font-mono text-[var(--text)]">{peakHour.count.toLocaleString()}</span> events
                  </p>
                )}
              </Panel>
            )}
          </>
        )}

        {/* Empty state */}
        {!loading && !error && data && data.total_events === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--surface)] flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </div>
            <p className="text-base font-semibold text-[var(--text)]">No events yet</p>
            <p className="text-sm text-[var(--muted)] mt-1 max-w-xs">
              Connect THE EYE Agent or an ingestion source to start seeing analytics here.
            </p>
          </div>
        )}

      </main>
    </NavBar>
  );
}
