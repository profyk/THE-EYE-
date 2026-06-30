"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import Badge from "@/components/Badge";
import { listTenants, TenantStats, ApiError } from "@/lib/api-client";

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

type Filter = "all" | "active" | "trial" | "past_due";

export default function SubscriptionsPage() {
  const ready = useRequireAuth();
  const [tenants, setTenants] = useState<TenantStats[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    listTenants()
      .then(setTenants)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load subscriptions"));
  }, [ready]);

  const filtered = tenants.filter((t) => {
    const s = t.paddle_subscription_status ?? "trial";
    const matchFilter =
      filter === "all" ||
      (filter === "active"   && s === "active") ||
      (filter === "trial"    && !t.paddle_subscription_status) ||
      (filter === "past_due" && s === "past_due");
    const q = search.toLowerCase();
    return matchFilter && (t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
  });

  if (!ready) return null;

  return (
    <AppShell>
      <main className="p-8 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-text">Subscription Management</h1>
          <p className="text-sm text-muted mt-1">{tenants.length} tenants total.</p>
        </div>

        {error && (
          <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        <Panel>
          <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <input
              type="text"
              placeholder="Search tenants…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60 w-64"
            />
            <div className="flex gap-1">
              {(["all", "active", "trial", "past_due"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                    filter === f ? "bg-accent text-void" : "bg-surface text-muted hover:text-text"
                  }`}
                >
                  {f.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider">
                  <th className="px-6 py-3 text-left font-semibold">Tenant</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Paddle Sub</th>
                  <th className="px-4 py-3 text-right font-semibold">Users</th>
                  <th className="px-4 py-3 text-right font-semibold">Events 30d</th>
                  <th className="px-4 py-3 text-right font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const status = t.paddle_subscription_status ?? "trial";
                  const variant =
                    status === "active"   ? "paid"      :
                    status === "trial"    ? "trial"     :
                    status === "past_due" ? "warn"      : "suspended";
                  return (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                      <td className="px-6 py-3">
                        <a href={`/tenants/${t.id}`} className="font-medium text-text hover:text-accent transition-colors">
                          {t.name}
                        </a>
                        <p className="text-[10px] text-muted">{t.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={variant}>{status}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">
                        {t.paddle_subscription_status ? "sub_***" : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{t.user_count}</td>
                      <td className="px-4 py-3 text-right font-mono">{t.event_count_30d.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-muted text-xs">{fmt(t.created_at)}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-muted text-sm">
                      {search || filter !== "all" ? "No tenants match your filters." : "No tenants yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>
    </AppShell>
  );
}
