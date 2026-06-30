"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import StatCard from "@/components/StatCard";
import Panel from "@/components/Panel";
import Badge from "@/components/Badge";
import { getBillingOverview, BillingOverview, ApiError } from "@/lib/api-client";

const STATUS_VARIANT: Record<string, "paid" | "trial" | "warn" | "suspended" | "neutral"> = {
  active:    "paid",
  trial:     "trial",
  past_due:  "warn",
  canceled:  "suspended",
  cancelled: "suspended",
};

export default function BillingPage() {
  const ready = useRequireAuth();
  const [data, setData] = useState<BillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    getBillingOverview()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load billing data"));
  }, [ready]);

  if (!ready) return null;

  const payRate = data ? Math.round((data.paying / Math.max(data.total_tenants, 1)) * 100) : 0;

  return (
    <AppShell>
      <main className="p-8 space-y-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Billing &amp; Revenue</h1>
          <p className="text-sm text-muted mt-1">Subscription status across all tenants.</p>
        </div>

        {error && (
          <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              <StatCard label="Total Tenants" value={data.total_tenants} tone="accent" />
              <StatCard label="Paying"        value={data.paying}        tone="safe"   sub="Active subscriptions" />
              <StatCard label="Trial"         value={data.trialing}      tone="accent" sub="No subscription yet" />
              <StatCard label="Past Due"      value={data.past_due}      tone="danger" sub="Payment failed" />
              <StatCard label="Conversion"    value={`${payRate}%`}      tone={payRate > 50 ? "safe" : "warn"} sub="Paid / total" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Panel>
                <div className="px-6 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-text">Subscription Breakdown</p>
                </div>
                <div className="px-6 py-4 space-y-3">
                  {data.status_breakdown.map((row) => {
                    const pct = Math.round((row.count / Math.max(data.total_tenants, 1)) * 100);
                    return (
                      <div key={row.status}>
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant={STATUS_VARIANT[row.status] ?? "neutral"}>{row.status}</Badge>
                          <span className="text-sm font-mono text-text">
                            {row.count} <span className="text-muted text-xs">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {data.status_breakdown.length === 0 && (
                    <p className="text-sm text-muted text-center py-4">No tenants yet.</p>
                  )}
                </div>
              </Panel>

              <Panel>
                <div className="px-6 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-text">Revenue Signals</p>
                </div>
                <div className="px-6 py-6 space-y-5">
                  {[
                    { label: "Paying tenants",              value: data.paying,    tone: "text-safe"   },
                    { label: "At-risk (past due)",          value: data.past_due,  tone: "text-danger" },
                    { label: "Churn candidates (cancelled)", value: data.cancelled, tone: "text-warn"   },
                    { label: "Growth pipeline (trial)",     value: data.trialing,  tone: "text-accent" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between">
                      <p className="text-sm text-muted">{row.label}</p>
                      <p className={`text-2xl font-bold font-mono ${row.tone}`}>{row.value}</p>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted pt-2 border-t border-border">
                    Revenue figures require Paddle API integration. Counts shown.
                  </p>
                </div>
              </Panel>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
