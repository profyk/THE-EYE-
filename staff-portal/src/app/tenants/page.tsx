"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import Badge from "@/components/Badge";
import { listTenants, suspendTenant, activateTenant, TenantStats, ApiError } from "@/lib/api-client";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtRelative(d: string | null) {
  if (!d) return "Never";
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return fmt(d);
}

export default function TenantsPage() {
  const ready = useRequireAuth();
  const [tenants, setTenants] = useState<TenantStats[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "suspended">("all");
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    listTenants()
      .then(setTenants)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load tenants"));
  }, [ready]);

  async function toggle(t: TenantStats) {
    setActing(t.id);
    try {
      const updated = t.is_active ? await suspendTenant(t.id) : await activateTenant(t.id);
      setTenants((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setActing(null);
    }
  }

  const filtered = tenants.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || (filter === "active" ? t.is_active : !t.is_active);
    return matchSearch && matchFilter;
  });

  if (!ready) return null;

  return (
    <AppShell>
      <main className="p-8 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Tenants</h1>
          <p className="text-sm text-muted mt-1">{tenants.length} organisations on the platform.</p>
        </div>

        {error && (
          <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        <Panel>
          <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search tenants…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60 w-64"
            />
            <div className="flex gap-1">
              {(["all", "active", "suspended"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                    filter === f ? "bg-accent text-void" : "bg-surface text-muted hover:text-text"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider">
                  <th className="px-6 py-3 text-left font-semibold">Organisation</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Billing</th>
                  <th className="px-4 py-3 text-right font-semibold">Users</th>
                  <th className="px-4 py-3 text-right font-semibold">Events 30d</th>
                  <th className="px-4 py-3 text-right font-semibold">Last Event</th>
                  <th className="px-4 py-3 text-right font-semibold">Created</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                    <td className="px-6 py-3">
                      <a href={`/tenants/${t.id}`} className="font-medium text-text hover:text-accent transition-colors">{t.name}</a>
                      <p className="text-[10px] text-muted">{t.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={t.is_active ? "active" : "suspended"}>{t.is_active ? "Active" : "Suspended"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={!t.paddle_subscription_status ? "trial" : t.paddle_subscription_status === "active" ? "paid" : "inactive"}>
                        {t.paddle_subscription_status ?? "Trial"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{t.user_count}</td>
                    <td className="px-4 py-3 text-right font-mono">{t.event_count_30d.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted text-xs">{fmtRelative(t.last_event_at)}</td>
                    <td className="px-4 py-3 text-right text-muted text-xs">{fmt(t.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggle(t)}
                        disabled={acting === t.id}
                        className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                          t.is_active
                            ? "text-danger hover:bg-danger/10 bg-danger/5"
                            : "text-safe hover:bg-safe/10 bg-safe/5"
                        }`}
                      >
                        {acting === t.id ? "…" : t.is_active ? "Suspend" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-10 text-center text-muted">No tenants match your filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>
    </AppShell>
  );
}
