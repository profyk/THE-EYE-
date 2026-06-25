"use client";

import Link from "next/link";
import { EventRead } from "@/types/event";
import EmptyState from "@/components/EmptyState";

function groupByDay(events: EventRead[]): Map<string, EventRead[]> {
  const groups = new Map<string, EventRead[]>();
  for (const event of events) {
    const day = new Date(event.occurred_at).toLocaleDateString();
    const bucket = groups.get(day) ?? [];
    bucket.push(event);
    groups.set(day, bucket);
  }
  return groups;
}

export default function TimelineView({ events }: { events: EventRead[] }) {
  // Events arrive newest-first from the API; render chronologically within each day.
  const sorted = [...events].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  const groups = groupByDay(sorted);

  if (events.length === 0) {
    return <EmptyState>No events to show.</EmptyState>;
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([day, dayEvents]) => (
        <div key={day}>
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">{day}</h3>
          <ol className="border-l-2 border-border ml-2">
            {dayEvents.map((e) => (
              <li key={e.id} className="ml-4 mb-3 relative">
                <span className="absolute -left-[1.4rem] top-1.5 w-2 h-2 rounded-full bg-accent" />
                <span className="text-xs text-muted font-mono">{new Date(e.occurred_at).toLocaleTimeString()}</span>{" "}
                <Link href={`/events/${e.id}`} className="text-accent hover:underline">
                  {e.event_type}
                </Link>{" "}
                <span className="text-sm text-muted">
                  by {e.actor_id} — {e.outcome}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
