"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import { getRevenueStats, RevenueStats, ApiError } from "@/lib/api-client";

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function StatBox({ label, value, sub, tone = "default" }: {
  label: string; value: string; sub?: string;
  tone?: "accent" | "safe" | "danger" | "warn" | "default";
}) {
  const colors: Record<string, string> = {
    accent: "text-accent", safe: "text-safe", danger: "text-danger", warn: "text-warn", default: "text-text",
  };
  return (
    <div className="bg-panel border border-border rounded-xl p-5">
      <p className="text-[10px] text-muted uppercase tracking-[0.15em] font-bold">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colors[tone]}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function BarChart({ data }: { data: { month: string; count: number }[] }) {
  if (!data.length) return <p className="text-sm text-muted text-center py-8">No data yet</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-2 h-36 px-2">
      {data.map((d) => {
        const pct = Math.round((d.count / max) * 100);
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[9px] text-accent font-bold">{d.count}</span>
            <div
              className="w-full bg-accent/20 rounded-t-sm transition-all"
              style={{ height: `${Math.max(pct, 4)}%` }}
            />
            <span className="text-[9px] text-muted font-mono">{d.month.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

function DonutSegments({ stats }: { stats: RevenueStats }) {
  const segments = [
    { label: "Paying", count: stats.paying_count, color: "#22c55e" },
    { label: "Trialing", count: stats.trialing_count, color: "#f59e0b" },
    { label: "Past Due", count: stats.past_due_count, color: "#ef4444" },
    { label: "Churned", count: stats.churned_count, color: "#6b7280" },
  ].filter((s) => s.count > 0);
  const total = segments.reduce((a, s) => a + s.count, 0) || 1;
  return (
    <div className="flex gap-6 items-center flex-wrap">
      <div className="relative w-28 h-28 shrink-0">
        <svg viewBox="0 0 36 36" className="rotate-[-90deg]">
          {(() => {
            let offset = 0;
            return segments.map((s) => {
              const pct = (s.count / total) * 100;
              const el = (
                <circle
                  key={s.label}
                  cx="18" cy="18" r="15.9"
                  fill="transparent"
                  stroke={s.color}
                  strokeWidth="3.8"
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += pct;
              return el;
            });
          })()}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-text">{total}</span>
          <span className="text-[9px] text-muted">Total</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-sm text-text">{s.label}</span>
            <span className="text-sm font-bold text-text ml-1">{s.count}</span>
            <span className="text-xs text-muted">({Math.round((s.count / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RevenuePage() {
  const ready = useRequireAuth();
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    getRevenueStats().then(setStats).catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load revenue stats"));
  }, [ready]);

  if (!ready) return null;

  return (
    <AppShell>
      <main className="p-8 space-y-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Revenue Intelligence</h1>
          <p className="text-sm text-muted mt-1">Financial health and subscription metrics across all clients</p>
        </div>

        {error && <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>}

        {stats && (
          <>
            {/* Top KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
              <StatBox label="MRR" value={fmt$(stats.mrr)} sub="Monthly Recurring" tone="accent" />
              <StatBox label="ARR" value={fmt$(stats.arr)} sub="Annual Run Rate" tone="accent" />
              <StatBox label="Paying" value={String(stats.paying_count)} sub="Active subscriptions" tone="safe" />
              <StatBox label="Trialing" value={String(stats.trialing_count)} sub="Free / trial tier" tone="warn" />
              <StatBox label="Past Due" value={String(stats.past_due_count)} sub="Payment overdue" tone="danger" />
              <StatBox label="Churned" value={String(stats.churned_count)} sub="Cancelled" />
              <StatBox label="Growth 30d" value={`+${stats.growth_30d}`} sub="New clients" tone="safe" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Monthly trend */}
              <Panel>
                <div className="px-6 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-text">New Clients — 6 Month Trend</p>
                </div>
                <div className="px-6 py-5">
                  <BarChart data={stats.monthly_trend} />
                </div>
              </Panel>

              {/* Subscription breakdown */}
              <Panel>
                <div className="px-6 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-text">Subscription Breakdown</p>
                </div>
                <div className="px-6 py-5">
                  <DonutSegments stats={stats} />
                </div>
              </Panel>
            </div>

            {/* Revenue calculation note */}
            <Panel>
              <div className="px-6 py-4 border-b border-border">
                <p className="text-sm font-semibold text-text">Revenue Assumptions</p>
              </div>
              <div className="px-6 py-4 text-sm text-muted space-y-1">
                <p>MRR is computed from live Paddle subscription statuses: <span className="text-text font-mono">active × $29</span>.</p>
                <p>Past-due accounts are counted toward MRR at list price (not yet churned).</p>
                <p>Connect Paddle webhooks to keep subscription statuses in real time.</p>
              </div>
            </Panel>
          </>
        )}
      </main>
    </AppShell>
  );
}
