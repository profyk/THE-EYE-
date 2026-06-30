"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import NavBar from "@/components/NavBar";
import EventFilters from "@/components/EventFilters";
import EventTable from "@/components/EventTable";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { searchEvents, ApiError } from "@/lib/api-client";
import { EventRead, EventSearchParams } from "@/types/event";

const LIVE_POLL_MS = 5000;

export default function EventsPage() {
  const ready = useRequireAuth();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<EventSearchParams>({
    limit: 50,
    offset: 0,
    actor_id: searchParams.get("actor_id") ?? undefined,
  });
  const [events, setEvents] = useState<EventRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const maxSeenSeq = useRef<number>(0);

  useEffect(() => {
    if (!ready) return;
    // Starting the loading/error state for a fetch kicked off by this same
    // effect is the standard data-fetching pattern; there's no prior render
    // to derive it from.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    searchEvents(filters)
      .then((data) => {
        setEvents(data);
        maxSeenSeq.current = data.length > 0 ? Math.max(...data.map((e) => e.sequence_num)) : 0;
      })
      .catch((e: ApiError) => setError(e.message || "Failed to load events"))
      .finally(() => setLoading(false));
  }, [ready, filters]);

  useEffect(() => {
    if (!ready || !live) return;
    const interval = setInterval(() => {
      searchEvents(filters).then((data) => {
        const fresh = data.filter((e) => e.sequence_num > maxSeenSeq.current);
        if (fresh.length > 0) {
          setEvents(data);
          maxSeenSeq.current = Math.max(...data.map((e) => e.sequence_num));
          setNewIds(new Set(fresh.map((e) => e.id)));
          setTimeout(() => setNewIds(new Set()), 2000);
        }
      });
    }, LIVE_POLL_MS);
    return () => clearInterval(interval);
  }, [ready, live, filters]);

  if (!ready) return null;

  return (
    <NavBar>
      <main className="p-6 flex-1">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">Audit Events</h1>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            Live feed
            {live && <span className="w-2 h-2 rounded-full bg-safe animate-pulse-glow" />}
          </label>
        </div>
        <div className="mb-4">
          <EventFilters value={filters} onChange={(v) => setFilters({ ...v, offset: 0 })} />
        </div>
        {loading && <p className="text-sm text-muted">Loading...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        {!loading && !error && <EventTable events={events} highlightIds={newIds} />}
      </main>
    </NavBar>
  );
}
