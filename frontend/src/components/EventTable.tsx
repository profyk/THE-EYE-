"use client";

import Link from "next/link";
import { EventRead } from "@/types/event";
import StatusBadge, { StatusTone } from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";

const OUTCOME_TONE: Record<string, StatusTone> = {
  success: "safe",
  failure: "danger",
  denied: "warn",
  unknown: "muted",
};

interface Props {
  events: EventRead[];
  highlightIds?: Set<string>;
}

export default function EventTable({ events, highlightIds }: Props) {
  if (events.length === 0) {
    return <EmptyState>No events match the current filters.</EmptyState>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-border bg-surface">
            <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Seq</th>
            <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Occurred at</th>
            <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Actor</th>
            <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Event type</th>
            <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Category</th>
            <th className="py-2.5 px-3 text-xs uppercase tracking-wide text-muted font-semibold">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr
              key={e.id}
              className={`border-b border-border last:border-0 hover:bg-surface transition-colors ${
                highlightIds?.has(e.id) ? "bg-accent/10 animate-fade-in" : ""
              }`}
            >
              <td className="py-2.5 px-3 font-mono text-accent">{e.sequence_num}</td>
              <td className="py-2.5 px-3 text-muted">{new Date(e.occurred_at).toLocaleString()}</td>
              <td className="py-2.5 px-3">{e.actor_id}</td>
              <td className="py-2.5 px-3">
                <Link href={`/events/${e.id}`} className="hover:text-accent hover:underline">
                  {e.event_type}
                </Link>
              </td>
              <td className="py-2.5 px-3 text-muted">{e.event_category}</td>
              <td className="py-2.5 px-3">
                <StatusBadge tone={OUTCOME_TONE[e.outcome] ?? "muted"}>{e.outcome}</StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
