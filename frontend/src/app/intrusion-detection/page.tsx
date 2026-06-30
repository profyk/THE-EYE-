"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import StatCard from "@/components/StatCard";
import IntrusionMap from "@/components/IntrusionMap";
import EmptyState from "@/components/EmptyState";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getIntrusionStats, ApiError, IntrusionStats } from "@/lib/api-client";

export default function IntrusionDetectionPage() {
  const ready = useRequireAuth();
  const [stats, setStats] = useState<IntrusionStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see events/page.tsx
    setLoading(true);
    getIntrusionStats()
      .then(setStats)
      .catch((e: ApiError) => setError(e.message || "Failed to load intrusion stats"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  return (
    <NavBar>
      <main className="p-6 flex-1 max-w-4xl">
        <h1 className="text-lg font-semibold mb-1">Intrusion Detection</h1>
        <p className="text-sm text-muted mb-6">
          Real authentication failures against this platform -- rejected ingestion API keys and failed dashboard
          logins, each with a real IP and GeoIP lookup. This reflects attempts against THE EYE itself only; there is
          no external network/IDS data source feeding this yet.
        </p>

        {loading && <p className="text-sm text-muted">Loading...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        {stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <StatCard label="Attempts (recent)" value={stats.total_attempts} tone="danger" />
              <StatCard label="Countries of origin" value={stats.countries.length} tone="warn" />
              <StatCard label="Top country" value={stats.countries[0]?.country ?? "—"} tone="accent" />
            </div>

            <h2 className="text-sm font-semibold mb-2">Origin map (real coordinates)</h2>
            <div className="mb-6">
              <IntrusionMap attempts={stats.attempts} />
            </div>

            <h2 className="text-sm font-semibold mb-2">By country</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              {stats.countries.map((c) => (
                <div key={c.country} className="rounded-xl border border-border bg-panel px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold">{c.country}</span>
                  <div className="text-right">
                    <p className="text-lg font-extrabold font-mono text-danger leading-none">{c.count}</p>
                    <p className="text-[10px] text-muted uppercase tracking-wide">attempts</p>
                  </div>
                </div>
              ))}
            </div>

            <h2 className="text-sm font-semibold mb-2">Recent attempts</h2>
            {stats.attempts.length === 0 ? (
              <EmptyState>No failed authentication attempts recorded yet.</EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left border-b border-border bg-surface">
                      <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">When</th>
                      <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">IP</th>
                      <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Location</th>
                      <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.attempts.slice(0, 30).map((a, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-surface transition-colors">
                        <td className="py-2.5 px-3 text-muted">{new Date(a.occurred_at).toLocaleString()}</td>
                        <td className="py-2.5 px-3 font-mono text-xs text-warn">{a.ip}</td>
                        <td className="py-2.5 px-3">{[a.city, a.country].filter(Boolean).join(", ")}</td>
                        <td className="py-2.5 px-3 text-muted">{a.event_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </NavBar>
  );
}
