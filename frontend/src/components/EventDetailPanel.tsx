"use client";

import { ReactNode, useEffect, useState } from "react";
import { EventRead } from "@/types/event";
import { getWhistleblowerReport } from "@/lib/api-client";
import Panel from "@/components/Panel";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border text-sm">
      <span className="text-muted">{label}</span>
      <span className="col-span-2 break-all">{value ?? <span className="text-muted">—</span>}</span>
    </div>
  );
}

// The ledger only ever stores a report_id + content hash for whistleblower
// submissions (the full text lives in a separate, redactable table) -- fetch
// it separately rather than expecting it to show up in event.metadata.
function WhistleblowerReportText({ reportId }: { reportId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWhistleblowerReport(reportId)
      .then((r) => setText(r.report_text))
      .catch(() => setError("Unable to load report text (insufficient permissions or report not found)."));
  }, [reportId]);

  if (error) return <span className="text-muted">{error}</span>;
  if (text === null) return <span className="text-muted">Loading…</span>;
  return <p className="whitespace-pre-wrap">{text}</p>;
}

export default function EventDetailPanel({ event }: { event: EventRead }) {
  const reportId =
    event.event_type === "whistleblower.report_submitted" && typeof event.metadata?.report_id === "string"
      ? event.metadata.report_id
      : null;

  return (
    <div className="max-w-3xl">
      <Row label="Sequence #" value={<span className="font-mono text-accent">{event.sequence_num}</span>} />
      <Row label="Event type" value={event.event_type} />
      <Row label="Category" value={event.event_category} />
      <Row label="Outcome" value={event.outcome} />
      <Row label="Severity" value={event.severity} />
      <Row label="Actor" value={`${event.actor_id} (${event.actor_type})`} />
      <Row label="Actor display name" value={event.actor_display_name} />
      <Row label="Occurred at" value={new Date(event.occurred_at).toLocaleString()} />
      <Row label="Received at" value={new Date(event.received_at).toLocaleString()} />
      <Row label="Origin host" value={event.origin_host} />
      <Row label="Origin IP" value={event.origin_ip} />
      <Row label="Origin application" value={event.origin_application} />
      <Row label="Target" value={event.target_type ? `${event.target_type}:${event.target_id}` : null} />
      <Row
        label="Change summary"
        value={
          event.change_summary ? (
            <pre className="text-xs font-mono text-muted whitespace-pre-wrap">
              {JSON.stringify(event.change_summary, null, 2)}
            </pre>
          ) : null
        }
      />
      <Row
        label="Metadata"
        value={
          <pre className="text-xs font-mono text-muted whitespace-pre-wrap">{JSON.stringify(event.metadata, null, 2)}</pre>
        }
      />
      {reportId && <Row label="Report text" value={<WhistleblowerReportText reportId={reportId} />} />}

      <Panel className="mt-4 p-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Hash chain linkage</p>
        <Row label="prev_hash" value={<span className="font-mono text-xs">{event.prev_hash}</span>} />
        <Row label="record_hash" value={<span className="font-mono text-xs">{event.record_hash}</span>} />
      </Panel>
    </div>
  );
}
