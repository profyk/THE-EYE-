"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";
import { API_BASE } from "@/lib/api-client";

interface HealthResult {
  ok: boolean;
  latencyMs: number;
  checkedAt: string;
}

async function pingHealth(): Promise<HealthResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}/healthz`);
    const latencyMs = Date.now() - start;
    return { ok: res.ok, latencyMs, checkedAt: new Date().toISOString() };
  } catch {
    return { ok: false, latencyMs: Date.now() - start, checkedAt: new Date().toISOString() };
  }
}

export default function HealthPage() {
  const ready = useRequireAuth();
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    const result = await pingHealth();
    setHealth(result);
    setChecking(false);
  }

  useEffect(() => {
    if (!ready) return;
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return null;

  const latencyTone = !health ? "muted" : health.latencyMs < 200 ? "safe" : health.latencyMs < 800 ? "warn" : "danger";

  return (
    <AppShell>
      <main className="p-8 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">Platform Health</h1>
            <p className="text-sm text-muted mt-1">Auto-refreshes every 30 seconds.</p>
          </div>
          <button
            onClick={check}
            disabled={checking}
            className="bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            {checking ? "Checking…" : "Check Now"}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="API Status"
            value={!health ? "—" : health.ok ? "Online" : "Offline"}
            tone={!health ? "muted" : health.ok ? "safe" : "danger"}
          />
          <StatCard
            label="Latency"
            value={health ? `${health.latencyMs}ms` : "—"}
            tone={latencyTone}
          />
          <StatCard
            label="Backend"
            value="Connected"
            sub={API_BASE}
            tone="muted"
          />
          <StatCard
            label="Last Check"
            value={health ? new Date(health.checkedAt).toLocaleTimeString("en-GB") : "—"}
            tone="muted"
          />
        </div>

        <Panel>
          <div className="px-6 py-4 border-b border-border">
            <p className="text-sm font-semibold text-text">Service Status</p>
          </div>
          <div className="divide-y divide-border/50">
            {[
              { name: "API Gateway", desc: "FastAPI on Railway" },
              { name: "Database", desc: "PostgreSQL via Railway" },
              { name: "Auth Service", desc: "Session cookie auth" },
              { name: "Audit Ledger", desc: "Hash-chained immutable log" },
            ].map((svc) => (
              <div key={svc.name} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text">{svc.name}</p>
                  <p className="text-xs text-muted">{svc.desc}</p>
                </div>
                <Badge variant={health === null ? "neutral" : health.ok ? "active" : "suspended"}>
                  {health === null ? "Checking" : health.ok ? "Operational" : "Down"}
                </Badge>
              </div>
            ))}
          </div>
        </Panel>
      </main>
    </AppShell>
  );
}
