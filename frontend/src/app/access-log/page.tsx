"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { searchEvents, ApiError } from "@/lib/api-client";
import { EventRead } from "@/types/event";
import StatusBadge, { StatusTone } from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";

const OUTCOME_TONE: Record<string, StatusTone> = {
  success: "safe",
  failure: "danger",
};

function geoLabel(event: EventRead): string {
  const geo = event.metadata?.geo as { city?: string; country?: string } | undefined;
  if (!geo || (!geo.city && !geo.country)) return "—";
  return [geo.city, geo.country].filter(Boolean).join(", ");
}

export default function AccessLogPage() {
  const ready = useRequireAuth();
  const [events, setEvents] = useState<EventRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see events/page.tsx
    setLoading(true);
    searchEvents({ event_type: "auth.dashboard_login", limit: 100 })
      .then(setEvents)
      .catch((e: ApiError) => setError(e.message || "Failed to load access log"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  return (
    <NavBar>
      <main className="p-6 flex-1">
        <h1 className="text-lg font-semibold mb-1">Access Log</h1>
        <p className="text-sm text-muted mb-4">
          Every dashboard login attempt, success or failure -- this is real ledger data, not a separate log.
        </p>
        {loading && <p className="text-sm text-muted">Loading...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        {!loading && !error && events.length === 0 && <EmptyState>No login attempts recorded yet.</EmptyState>}
        {!loading && !error && events.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-border bg-surface">
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Timestamp</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Username</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Outcome</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">IP</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Location</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-surface transition-colors">
                    <td className="py-2.5 px-3 text-muted">{new Date(e.occurred_at).toLocaleString()}</td>
                    <td className="py-2.5 px-3">{e.actor_id}</td>
                    <td className="py-2.5 px-3">
                      <StatusBadge tone={OUTCOME_TONE[e.outcome] ?? "muted"}>{e.outcome}</StatusBadge>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-muted">{e.origin_ip ?? "—"}</td>
                    <td className="py-2.5 px-3 text-muted">{geoLabel(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </NavBar>
  );
}
