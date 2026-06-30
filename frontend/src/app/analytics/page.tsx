"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getAnalytics, ApiError, AnalyticsData } from "@/lib/api-client";

// ── Palette for categories/severities ────────────────────────────────────────
const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--danger)",
  high: "var(--warn)",
  info: "var(--muted)",
  low: "var(--safe)",
};

const OUTCOME_COLOR: Record<string, string> = {
  success: "var(--safe)",
  failure: "var(--danger)",
  denied: "var(--warn)",
  unknown: "var(--muted)",
};

const CATEGORY_COLOR: Record<string, string> = {
  authentication: "var(--accent)",
  authorization: "var(--iris)",
  data_access: "var(--warn)",
  data_modification: "var(--danger)",
  configuration: "var(--safe)",
  process_execution: "var(--muted)",
  network: "var(--accent-dim)",
  financial_transaction: "var(--warn)",
  administrative: "var(--iris)",
  system: "var(--muted)",
};

// ── SVG bar chart (vertical, for events-by-day) ───────────────────────────────
function DayBarChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) return <EmptyState>No events in last 30 days.</EmptyState>;
  const max = Math.max(...data.map((d) => d.count), 1);
  const W = 700;
  const H = 140;
  const BOTTOM = 24;
  const barW = Math.max(4, Math.floor((W / data.length) - 2));
  const gap = Math.floor((W - barW * data.length) / Math.max(data.length - 1, 1));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Events per day">
      {data.map((d, i) => {
        const h = Math.max(2, ((d.count / max) * (H - BOTTOM - 8)));
        const x = i * (barW + gap);
        const y = H - BOTTOM - h;
        const showLabel = data.length <= 20 || i % Math.ceil(data.length / 15) === 0;
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={h} rx={2} fill="var(--accent)" opacity={0.75} />
            {showLabel && (
              <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize={7} fill="var(--muted)">
                {d.date.slice(5)}
              </text>
            )}
            <title>{`${d.date}: ${d.count} events`}</title>
          </g>
        );
      })}
    </svg>
  );
}

// ── Horizontal percentage bar ─────────────────────────────────────────────────
function HBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 text-xs text-muted truncate shrink-0" title={label}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 text-right text-xs font-mono text-muted shrink-0">{count}</span>
    </div>
  );
}

// ── Hour-of-day bar chart (SVG) ───────────────────────────────────────────────
function HourChart({ data }: { data: { hour: number; count: number }[] }) {
  const filled: number[] = Array(24).fill(0);
  data.forEach((d) => { filled[d.hour] = d.count; });
  const max = Math.max(...filled, 1);
  const W = 700;
  const H = 80;
  const BOTTOM = 16;
  const barW = Math.floor(W / 24) - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Activity by hour">
      {filled.map((count, hour) => {
        const h = Math.max(count > 0 ? 2 : 0, ((count / max) * (H - BOTTOM - 4)));
        const x = hour * (barW + 1);
        return (
          <g key={hour}>
            <rect x={x} y={H - BOTTOM - h} width={barW} height={h} rx={1} fill="var(--iris)" opacity={0.8} />
            {hour % 3 === 0 && (
              <text x={x + barW / 2} y={H - 3} textAnchor="middle" fontSize={7} fill="var(--muted)">
                {hour.toString().padStart(2, "0")}
              </text>
            )}
            <title>{`${hour.toString().padStart(2, "0")}:00 — ${count} events`}</title>
          </g>
        );
      })}
    </svg>
  );
}

export default function AnalyticsPage() {
  const ready = useRequireAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getAnalytics()
      .then(setData)
      .catch((e: ApiError) => setError(e.message || "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  const catTotal = data?.events_by_category.reduce((s, r) => s + r.count, 0) ?? 1;
  const sevTotal = data?.events_by_severity.reduce((s, r) => s + r.count, 0) ?? 1;
  const outcomeTotal = data?.outcome_breakdown.reduce((s, r) => s + r.count, 0) ?? 1;
  const typeTotal = data?.top_event_types.reduce((s, r) => s + r.count, 0) ?? 1;

  const peakHour = data?.activity_by_hour.reduce((a, b) => (b.count > a.count ? b : a), { hour: 0, count: 0 });
  const peakDay = data?.events_by_day.reduce((a, b) => (b.count > a.count ? b : a), { date: "—", count: 0 });

  return (
    <NavBar>
      <main className="p-6 flex-1 space-y-6">
        <h1 className="text-lg font-semibold">Analytics</h1>

        {loading && <p className="text-sm text-muted">Loading...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Events" value={data.total_events} tone="accent" />
              <StatCard label="Peak Day" value={peakDay?.count ?? 0} tone="iris" />
              <StatCard label="Peak Hour" value={peakHour ? `${String(peakHour.hour).padStart(2, "0")}:00` : "—"} tone="warn" />
              <StatCard label="Event Types" value={data.top_event_types.length} tone="safe" />
            </div>

            <Panel className="p-5">
              <p className="text-xs font-bold tracking-wide text-muted uppercase mb-4">
                Event volume — last 30 days
              </p>
              <DayBarChart data={data.events_by_day} />
            </Panel>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Panel className="p-5">
                <p className="text-xs font-bold tracking-wide text-muted uppercase mb-4">By category</p>
                <div className="space-y-2.5">
                  {data.events_by_category.map((r) => (
                    <HBar
                      key={r.category}
                      label={r.category}
                      count={r.count}
                      total={catTotal}
                      color={CATEGORY_COLOR[r.category] ?? "var(--muted)"}
                    />
                  ))}
                </div>
              </Panel>

              <Panel className="p-5">
                <p className="text-xs font-bold tracking-wide text-muted uppercase mb-4">By severity</p>
                <div className="space-y-2.5 mb-6">
                  {data.events_by_severity.map((r) => (
                    <HBar
                      key={r.severity}
                      label={r.severity}
                      count={r.count}
                      total={sevTotal}
                      color={SEVERITY_COLOR[r.severity] ?? "var(--muted)"}
                    />
                  ))}
                </div>
                <p className="text-xs font-bold tracking-wide text-muted uppercase mb-4">By outcome</p>
                <div className="space-y-2.5">
                  {data.outcome_breakdown.map((r) => (
                    <HBar
                      key={r.outcome}
                      label={r.outcome}
                      count={r.count}
                      total={outcomeTotal}
                      color={OUTCOME_COLOR[r.outcome] ?? "var(--muted)"}
                    />
                  ))}
                </div>
              </Panel>
            </div>

            <Panel className="p-5">
              <p className="text-xs font-bold tracking-wide text-muted uppercase mb-4">Top event types</p>
              <div className="space-y-2.5">
                {data.top_event_types.map((r) => (
                  <HBar
                    key={r.event_type}
                    label={r.event_type}
                    count={r.count}
                    total={typeTotal}
                    color="var(--accent)"
                  />
                ))}
              </div>
            </Panel>

            <Panel className="p-5">
              <p className="text-xs font-bold tracking-wide text-muted uppercase mb-4">
                Activity by hour of day (all time)
              </p>
              <HourChart data={data.activity_by_hour} />
            </Panel>
          </>
        )}
      </main>
    </NavBar>
  );
}
