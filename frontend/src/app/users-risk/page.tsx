"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import ProgressBar from "@/components/ProgressBar";
import { StatusTone } from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getActorRiskScores, ApiError, ActorRiskScore } from "@/lib/api-client";

function riskTone(score: number): StatusTone {
  if (score >= 50) return "danger";
  if (score >= 20) return "warn";
  return "safe";
}

const TEXT_COLOR: Record<StatusTone, string> = {
  accent: "text-accent",
  danger: "text-danger",
  warn: "text-warn",
  safe: "text-safe",
  iris: "text-iris",
  muted: "text-muted",
};

const BORDER_COLOR: Record<StatusTone, string> = {
  accent: "var(--accent)",
  danger: "var(--danger)",
  warn: "var(--warn)",
  safe: "var(--safe)",
  iris: "var(--iris)",
  muted: "var(--border)",
};

export default function UsersRiskPage() {
  const ready = useRequireAuth();
  const [scores, setScores] = useState<ActorRiskScore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see events/page.tsx
    setLoading(true);
    getActorRiskScores()
      .then(setScores)
      .catch((e: ApiError) => setError(e.message || "Failed to load risk scores"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="p-6 flex-1 max-w-4xl">
        <h1 className="text-lg font-semibold mb-1">Users</h1>
        <p className="text-sm text-muted mb-6">
          Risk score is a transparent heuristic over real ledger history (failed logins, critical/high severity
          events, administrative and financial-transaction activity) -- not a trained model.
        </p>
        {loading && <p className="text-sm text-muted">Loading...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        {!loading && !error && (
          <div className="flex flex-col gap-4">
            {scores.map((s) => {
              const tone = riskTone(s.risk_score);
              return (
                <Panel key={s.actor_id} className="p-5" style={{ borderColor: `${BORDER_COLOR[tone]}55` }}>
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                      <span
                        className={`w-[52px] h-[52px] rounded-full bg-surface border-2 flex items-center justify-center text-sm font-extrabold shrink-0 ${TEXT_COLOR[tone]}`}
                        style={{ borderColor: BORDER_COLOR[tone] }}
                      >
                        {s.actor_id.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="font-extrabold text-base">{s.actor_id}</p>
                        <p className="text-xs text-muted">{s.total_events} events recorded</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-3xl font-black font-mono ${TEXT_COLOR[tone]}`}>
                        {s.risk_score}
                        <span className="text-sm text-muted font-normal">/100</span>
                      </p>
                      <p className={`text-[11px] uppercase font-bold tracking-wide ${TEXT_COLOR[tone]}`}>Risk Score</p>
                    </div>
                  </div>
                  <ProgressBar value={s.risk_score} tone={tone} className="mt-4 h-1.5" />
                  <p className="text-xs text-muted mt-3">
                    {s.failed_count} failed &middot; {s.critical_count} critical/high &middot; {s.admin_count} administrative
                    &middot; {s.financial_count} financial
                    {s.last_seen_at && <> &middot; last seen {new Date(s.last_seen_at).toLocaleString()}</>}
                  </p>
                  <Link
                    href={`/events?actor_id=${encodeURIComponent(s.actor_id)}`}
                    className="inline-block mt-4 text-xs font-semibold text-accent border border-accent/40 rounded-lg px-3 py-1.5 hover:bg-accent/10 transition-colors"
                  >
                    View activity →
                  </Link>
                </Panel>
              );
            })}
            {scores.length === 0 && <EmptyState>No activity recorded yet.</EmptyState>}
          </div>
        )}
      </main>
    </div>
  );
}
