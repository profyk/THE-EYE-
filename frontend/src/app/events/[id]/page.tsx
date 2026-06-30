"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import EventDetailPanel from "@/components/EventDetailPanel";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getEvent, ApiError } from "@/lib/api-client";
import { EventRead } from "@/types/event";

export default function EventDetailPage() {
  const ready = useRequireAuth();
  const params = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    getEvent(params.id)
      .then(setEvent)
      .catch((e: ApiError) => setError(e.message || "Failed to load event"));
  }, [ready, params.id]);

  if (!ready) return null;

  return (
    <NavBar>
      <main className="p-6 flex-1">
        <Link href="/events" className="text-sm text-muted hover:text-accent transition-colors">
          ← Back to events
        </Link>
        <h1 className="text-lg font-semibold my-4">Event detail</h1>
        {error && <p className="text-sm text-danger">{error}</p>}
        {event && <EventDetailPanel event={event} />}
      </main>
    </NavBar>
  );
}
