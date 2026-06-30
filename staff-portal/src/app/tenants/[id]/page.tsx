"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";
import { getTenant, suspendTenant, activateTenant, TenantStats, ApiError } from "@/lib/api-client";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TenantDetailPage() {
  const ready = useRequireAuth();
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<TenantStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!ready) return;
    getTenant(id)
      .then(setTenant)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load tenant"));
  }, [ready, id]);

  async function toggle() {
    if (!tenant) return;
    setActing(true);
    try {
      const updated = tenant.is_active ? await suspendTenant(tenant.id) : await activateTenant(tenant.id);
      setTenant(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  if (!ready) return null;

  return (
    <AppShell>
      <main className="p-8 space-y-6 animate-fade-in">
        <div className="flex items-start justify-between">
          <div>
            <a href="/tenants" className="text-xs text-muted hover:text-accent transition-colors">← Tenants</a>
            <h1 className="text-2xl font-bold text-text tracking-tight mt-1">{tenant?.name ?? "Loading…"}</h1>
            {tenant && <p className="text-sm text-muted mt-0.5 font-mono">{tenant.slug}</p>}
          </div>
          {tenant && (
            <div className="flex items-center gap-3">
              <Badge variant={tenant.is_active ? "active" : "suspended"}>{tenant.is_active ? "Active" : "Suspended"}</Badge>
              <button
                onClick={toggle}
                disabled={acting}
                className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                  tenant.is_active ? "bg-danger/10 text-danger hover:bg-danger/20" : "bg-safe/10 text-safe hover:bg-safe/20"
                }`}
              >
                {acting ? "…" : tenant.is_active ? "Suspend Tenant" : "Activate Tenant"}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {tenant && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Users" value={tenant.user_count} tone="accent" />
              <StatCard label="Events (30d)" value={tenant.event_count_30d.toLocaleString()} tone="warn" />
              <StatCard label="Billing" value={tenant.paddle_subscription_status ?? "Trial"} tone={tenant.paddle_subscription_status === "active" ? "safe" : "muted"} />
              <StatCard label="Last Event" value={tenant.last_event_at ? new Date(tenant.last_event_at).toLocaleDateString("en-GB") : "Never"} tone="muted" />
            </div>

            <Panel>
              <div className="px-6 py-4 border-b border-border">
                <p className="text-sm font-semibold text-text">Tenant Details</p>
              </div>
              <div className="px-6 py-5 grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                {[
                  ["Tenant ID", tenant.id],
                  ["Slug", tenant.slug],
                  ["Created", fmt(tenant.created_at)],
                  ["Last Event", fmt(tenant.last_event_at)],
                  ["Subscription Status", tenant.paddle_subscription_status ?? "—"],
                  ["Status", tenant.is_active ? "Active" : "Suspended"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-text font-mono text-xs break-all">{value}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </>
        )}
      </main>
    </AppShell>
  );
}
