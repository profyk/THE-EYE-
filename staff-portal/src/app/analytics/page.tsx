"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";
import { getPlatformAnalytics, PlatformAnalytics, ApiError } from "@/lib/api-client";

const SEVERITY_VARIANT: Record<string, "danger" | "warn" | "active" | "neutral"> = {
  critical: "danger",
  high:     "warn",
  medium:   "active",
  low:      "neutral",
  info:     "neutral",
};

export default function AnalyticsPage() {
  const ready = useRequireAuth();
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    getPlatformAnalytics()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load analytics"));
  }, [ready]);

  if (!ready) return null;

  const totalEvents   = data?.events_by_day.reduce((s, r) => s + r.count, 0) ?? 0;
  const maxDay        = data ? Math.max(...data.events_by_day.map((r) => r.count), 1) : 1;
  const criticalCount = data?.events_by_severity.find((r) => r.severity === "critical")?.count ?? 0;

  return (
    <AppShell>
      <main className="p-8 space-y-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Platform Analytics</h1>
          <p className="text-sm text-muted mt-1">Aggregated intelligence across all tenants — last 30 days.</p>
        </div>

        {error && (
          <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Events (30d)"  value={totalEvents.toLocaleString()} tone="accent" />
              <StatCard label="Critical Events"     value={criticalCount.toLocaleString()} tone="danger" />
              <StatCard label="Active Tenants"      value={data.top_tenants.length} tone="muted" />
              <StatCard label="Event Categories"    value={data.events_by_category.length} tone="muted" />
            </div>

            {/* Bar chart */}
            <Panel>
              <div className="px-6 py-4 border-b border-border">
                <p className="text-sm font-semibold text-text">Event Volume — Last 30 Days</p>
              </div>
              <div className="px-6 py-6">
                {data.events_by_day.length === 0 ? (
                  <p className="text-center text-muted text-sm py-8">No events in this period.</p>
                ) : (
                  <div className="flex items-end gap-0.5 h-32">
                    {data.events_by_day.map((d) => (
                      <div
                        key={d.date}
                        className="flex-1 bg-accent/60 hover:bg-accent rounded-sm transition-all cursor-default"
                        style={{ height: `${Math.max(2, (d.count / maxDay) * 128)}px` }}
                        title={`${d.date}: ${d.count.toLocaleString()}`}
                      />
                    ))}
                  </div>
                )}
                <div className="flex justify-between mt-2 text-[10px] text-muted">
                  <span>{data.events_by_day[0]?.date ?? ""}</span>
                  <span>{data.events_by_day[data.events_by_day.length - 1]?.date ?? ""}</span>
                </div>
              </div>
            </Panel>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Severity */}
              <Panel>
                <div className="px-6 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-text">By Severity</p>
                </div>
                <div className="px-6 py-4 space-y-3">
                  {data.events_by_severity.map((r) => {
                    const pct = Math.round((r.count / Math.max(totalEvents, 1)) * 100);
                    return (
                      <div key={r.severity}>
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant={SEVERITY_VARIANT[r.severity] ?? "neutral"}>{r.severity}</Badge>
                          <span className="text-xs font-mono text-text">
                            {r.count.toLocaleString()} <span className="text-muted">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-surface rounded-full">
                          <div className="h-full bg-accent/70 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {data.events_by_severity.length === 0 && (
                    <p className="text-sm text-muted text-center py-4">No data.</p>
                  )}
                </div>
              </Panel>

              {/* Category */}
              <Panel>
                <div className="px-6 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-text">By Category</p>
                </div>
                <div className="divide-y divide-border/50">
                  {data.events_by_category.map((r, i) => (
                    <div key={r.category} className="px-6 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted w-4 text-right">{i + 1}</span>
                        <span className="text-sm text-text capitalize">{r.category}</span>
                      </div>
                      <span className="text-sm font-mono text-muted">{r.count.toLocaleString()}</span>
                    </div>
                  ))}
                  {data.events_by_category.length === 0 && (
                    <p className="text-sm text-muted text-center py-6">No data.</p>
                  )}
                </div>
              </Panel>

              {/* Top tenants */}
              <Panel>
                <div className="px-6 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-text">Top Tenants by Events</p>
                </div>
                <div className="divide-y divide-border/50">
                  {data.top_tenants.map((r, i) => (
                    <div key={r.tenant_id} className="px-6 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted w-4 text-right">{i + 1}</span>
                        <span className="text-sm text-text">{r.tenant_name}</span>
                      </div>
                      <span className="text-sm font-mono text-accent">{r.count.toLocaleString()}</span>
                    </div>
                  ))}
                  {data.top_tenants.length === 0 && (
                    <p className="text-sm text-muted text-center py-6">No data.</p>
                  )}
                </div>
              </Panel>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
