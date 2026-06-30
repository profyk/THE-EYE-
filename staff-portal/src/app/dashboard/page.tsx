"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import StatCard from "@/components/StatCard";
import Panel from "@/components/Panel";
import Badge from "@/components/Badge";
import { getOverview, listTenants, PlatformOverview, TenantStats, ApiError } from "@/lib/api-client";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function subStatus(t: TenantStats): "active" | "suspended" | "trial" | "paid" | "inactive" {
  if (!t.is_active) return "suspended";
  if (!t.paddle_subscription_status) return "trial";
  if (t.paddle_subscription_status === "active") return "paid";
  return "inactive";
}

export default function DashboardPage() {
  const ready = useRequireAuth();
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [tenants, setTenants] = useState<TenantStats[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    Promise.all([getOverview(), listTenants()])
      .then(([ov, ts]) => {
        setOverview(ov);
        setTenants(ts.slice(0, 8));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load data"));
  }, [ready]);

  if (!ready) return null;

  return (
    <AppShell>
      <main className="p-8 space-y-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Platform Dashboard</h1>
          <p className="text-sm text-muted mt-1">Real-time overview of all tenants and system health.</p>
        </div>

        {error && (
          <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Total Tenants" value={overview.total_tenants} tone="accent" />
            <StatCard label="Active" value={overview.active_tenants} tone="safe" />
            <StatCard label="Suspended" value={overview.suspended_tenants} tone="danger" />
            <StatCard label="Total Users" value={overview.total_users} tone="accent" />
            <StatCard label="Events (30d)" value={overview.total_events_30d.toLocaleString()} tone="warn" />
            <StatCard label="New Tenants (30d)" value={overview.new_tenants_30d} tone="muted" />
          </div>
        )}

        <Panel>
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-text">Recent Tenants</p>
            <a href="/tenants" className="text-xs text-accent hover:underline">View all →</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider">
                  <th className="px-6 py-3 text-left font-semibold">Tenant</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Billing</th>
                  <th className="px-4 py-3 text-right font-semibold">Users</th>
                  <th className="px-4 py-3 text-right font-semibold">Events 30d</th>
                  <th className="px-4 py-3 text-right font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                    <td className="px-6 py-3">
                      <a href={`/tenants/${t.id}`} className="font-medium text-text hover:text-accent transition-colors">{t.name}</a>
                      <p className="text-[10px] text-muted">{t.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={t.is_active ? "active" : "suspended"}>{t.is_active ? "Active" : "Suspended"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={subStatus(t)}>{t.paddle_subscription_status ?? "Trial"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text">{t.user_count}</td>
                    <td className="px-4 py-3 text-right font-mono text-text">{t.event_count_30d.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted text-xs">{fmt(t.created_at)}</td>
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-muted text-sm">No tenants yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>
    </AppShell>
  );
}
