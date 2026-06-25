"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import TimelineView from "@/components/TimelineView";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { searchEvents, ApiError } from "@/lib/api-client";
import { EventRead } from "@/types/event";

export default function TimelinePage() {
  const ready = useRequireAuth();
  const [events, setEvents] = useState<EventRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // See events/page.tsx for why this is disabled here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    searchEvents({ limit: 200, offset: 0 })
      .then(setEvents)
      .catch((e: ApiError) => setError(e.message || "Failed to load timeline"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="p-6 flex-1">
        <h1 className="text-lg font-semibold mb-4">Timeline</h1>
        {loading && <p className="text-sm text-muted">Loading...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        {!loading && !error && <TimelineView events={events} />}
      </main>
    </div>
  );
}
