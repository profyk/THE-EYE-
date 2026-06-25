"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import StatusBadge from "@/components/StatusBadge";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getSession } from "@/lib/auth";
import { getPlatformInfo, getChainSummary, getOverviewStats, ApiError, PlatformInfo, ChainSummary, OverviewStats } from "@/lib/api-client";

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm font-semibold ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const ready = useRequireAuth();
  const session = getSession();
  const [info, setInfo] = useState<PlatformInfo | null>(null);
  const [chain, setChain] = useState<ChainSummary | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    Promise.all([getPlatformInfo(), getChainSummary(), getOverviewStats()])
      .then(([i, c, s]) => { setInfo(i); setChain(c); setStats(s); })
      .catch((e: ApiError) => setError(e.message || "Failed to load platform info"));
  }, [ready]);

  if (!ready) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="p-6 flex-1 max-w-2xl space-y-6">
        <h1 className="text-lg font-semibold">Settings</h1>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Panel className="px-5">
          <p className="text-xs font-bold tracking-wide text-muted uppercase pt-4 pb-2">Platform</p>
          {info && (
            <>
              <Row label="Version" value={info.version} mono />
              <Row
                label="Environment"
                value={
                  <StatusBadge tone={info.env === "production" ? "safe" : "warn"}>
                    {info.env}
                  </StatusBadge>
                }
              />
              <Row label="API base URL" value={apiBase} mono />
              <Row label="Session TTL" value={`${info.session_ttl_hours}h`} />
              <Row label="Max batch size" value={info.max_batch_size.toLocaleString()} />
              <Row label="Max backdate" value={`${info.max_backdate_days} days`} />
            </>
          )}
        </Panel>

        <Panel className="px-5">
          <p className="text-xs font-bold tracking-wide text-muted uppercase pt-4 pb-2">AI Investigate</p>
          {info && (
            <>
              <Row
                label="Status"
                value={
                  <StatusBadge tone={info.ai_configured ? "safe" : "muted"}>
                    {info.ai_configured ? "Configured" : "Not configured"}
                  </StatusBadge>
                }
              />
              {info.ai_configured && info.anthropic_model && (
                <Row label="Model" value={info.anthropic_model} mono />
              )}
              {!info.ai_configured && (
                <p className="text-xs text-muted pb-3">
                  Set <code className="bg-surface px-1 rounded">ANTHROPIC_API_KEY</code> in{" "}
                  <code className="bg-surface px-1 rounded">backend/.env</code> to enable the AI Investigate feature.
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel className="px-5">
          <p className="text-xs font-bold tracking-wide text-muted uppercase pt-4 pb-2">Ledger</p>
          {chain && (
            <>
              <Row label="Total events in chain" value={chain.total_events.toLocaleString()} mono />
              <Row
                label="Sequence range"
                value={chain.first_sequence_num !== null ? `${chain.first_sequence_num} → ${chain.last_sequence_num}` : "—"}
                mono
              />
              <Row
                label="First event"
                value={chain.first_event_at ? new Date(chain.first_event_at).toLocaleDateString() : "—"}
              />
              <Row
                label="Last event"
                value={chain.last_event_at ? new Date(chain.last_event_at).toLocaleString() : "—"}
              />
            </>
          )}
          {stats && <Row label="Active sources" value={stats.active_sources} />}
        </Panel>

        <Panel className="px-5">
          <p className="text-xs font-bold tracking-wide text-muted uppercase pt-4 pb-2">Session</p>
          <Row label="Signed in as" value={session?.username ?? "—"} />
          <Row label="Role" value={<StatusBadge tone="accent">{session?.role ?? "—"}</StatusBadge>} />
          {info?.cors_origins && (
            <div className="py-3 border-b border-border last:border-0">
              <p className="text-sm text-muted mb-1">Allowed CORS origins</p>
              <div className="flex flex-wrap gap-1.5">
                {info.cors_origins.map((o) => (
                  <code key={o} className="text-xs bg-surface border border-border rounded px-2 py-0.5">
                    {o}
                  </code>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel className="px-5">
          <p className="text-xs font-bold tracking-wide text-muted uppercase pt-4 pb-2">Immutability guarantees</p>
          <div className="text-sm text-muted space-y-1.5 pb-4">
            <p>✓ App DB role: INSERT + SELECT only on ledger.events</p>
            <p>✓ BEFORE UPDATE/DELETE triggers reject mutations at DB level</p>
            <p>✓ SHA-256 hash chain — any out-of-band edit detectable</p>
            <p className="text-warn">⚠ Postgres superuser can bypass triggers — external notarization is Phase 2</p>
          </div>
        </Panel>
      </main>
    </div>
  );
}
