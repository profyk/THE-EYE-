"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getFileActivity, getUsbEvents, flagEvent, EventRead } from "@/lib/api-client";

// ── Helpers ───────────────────────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  "file.created":           { label: "CREATED",      color: "text-safe",   bg: "bg-safe/10",   dot: "bg-safe" },
  "file.deleted":           { label: "DELETED",       color: "text-danger", bg: "bg-danger/10", dot: "bg-danger" },
  "file.modified":          { label: "MODIFIED",      color: "text-accent", bg: "bg-accent/10", dot: "bg-accent" },
  "file.renamed":           { label: "RENAMED",       color: "text-iris",   bg: "bg-iris/10",   dot: "bg-iris" },
  "file.copied_to_usb":     { label: "COPIED → USB",  color: "text-danger", bg: "bg-danger/15", dot: "bg-danger" },
  "file.accessed":          { label: "ACCESSED",      color: "text-muted",  bg: "bg-surface",   dot: "bg-muted" },
  "file.permissions_changed":{ label: "PERMS CHANGED",color: "text-warn",   bg: "bg-warn/10",   dot: "bg-warn" },
  "usb.connected":          { label: "USB IN",        color: "text-warn",   bg: "bg-warn/10",   dot: "bg-warn" },
  "usb.disconnected":       { label: "USB OUT",       color: "text-muted",  bg: "bg-surface",   dot: "bg-muted" },
  "device.connected":       { label: "DEVICE",        color: "text-warn",   bg: "bg-warn/10",   dot: "bg-warn" },
};

function eventMeta(type: string) {
  return EVENT_META[type] ?? { label: type.toUpperCase(), color: "text-muted", bg: "bg-surface", dot: "bg-muted" };
}

function fileName(ev: EventRead): string {
  return (ev.metadata as Record<string, string>)?.file_name
    ?? (ev.metadata as Record<string, string>)?.device_description
    ?? ev.target_id ?? "—";
}

function filePath(ev: EventRead): string {
  return (ev.metadata as Record<string, string>)?.directory ?? "—";
}

function hostName(ev: EventRead): string {
  return (ev.metadata as Record<string, string>)?.host ?? ev.origin_host ?? "—";
}

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return ts;
  }
}

// ── Flag modal ────────────────────────────────────────────────────────────────

function FlagModal({
  event,
  onClose,
  onDone,
}: {
  event: EventRead;
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<"suspicious" | "unlawful" | "evidence" | "cleared">("suspicious");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      await flagEvent(event.id, type, note || undefined);
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-panel border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-semibold text-text mb-1">Flag Event</h3>
        <p className="text-xs text-muted mb-4 truncate">{fileName(event)}</p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {(["suspicious", "unlawful", "evidence", "cleared"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`py-2 rounded-lg text-xs font-semibold capitalize border transition-colors ${
                type === t
                  ? t === "unlawful" ? "bg-danger border-danger text-white"
                    : t === "suspicious" ? "bg-warn border-warn text-black"
                    : t === "evidence" ? "bg-iris border-iris text-white"
                    : "bg-safe border-safe text-black"
                  : "border-border text-muted hover:border-accent hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <textarea
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-muted resize-none h-24 focus:outline-none focus:border-accent"
          placeholder="Add a note (optional) — e.g. This deletion was not authorised by department head"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {err && <p className="text-xs text-danger mt-1">{err}</p>}

        <div className="flex gap-2 mt-4">
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-accent text-void text-sm font-semibold hover:bg-accent-dim disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Submit Flag"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "files" | "usb";

export default function FileActivityPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "usb" ? "usb" : "files");
  const [events, setEvents] = useState<EventRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [actor, setActor] = useState("");
  const [host, setHost] = useState("");
  const [operation, setOperation] = useState("");
  const [flagTarget, setFlagTarget] = useState<EventRead | null>(null);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const data =
        tab === "files"
          ? await getFileActivity({ actor_id: actor || undefined, host: host || undefined, operation: operation || undefined, limit: 200 })
          : await getUsbEvents({ actor_id: actor || undefined, host: host || undefined, limit: 200 });
      setEvents(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(load, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, actor, host, operation]);

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">File Activity</h1>
          <p className="text-xs text-muted mt-0.5">Real-time file system events from all enrolled machines</p>
        </div>
        <div className="flex gap-1 bg-deep border border-border rounded-lg p-0.5">
          {(["files", "usb"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === t ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
              }`}
            >
              {t === "files" ? "File Events" : "USB & Devices"}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          className="bg-deep border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent w-44"
          placeholder="Filter by actor…"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
        />
        <input
          className="bg-deep border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent w-44"
          placeholder="Filter by machine…"
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
        {tab === "files" && (
          <select
            className="bg-deep border border-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
          >
            <option value="">All operations</option>
            <option value="file.created">Created</option>
            <option value="file.deleted">Deleted</option>
            <option value="file.modified">Modified</option>
            <option value="file.renamed">Renamed</option>
            <option value="file.copied_to_usb">Copied to USB</option>
          </select>
        )}
        <span className="ml-auto text-xs text-muted self-center">
          {events.length} event{events.length !== 1 ? "s" : ""} · auto-refresh 15s
        </span>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-deep">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted text-sm">Loading…</div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6" />
            </svg>
            <p className="text-sm">No file events yet — agent is monitoring</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {events.map((ev) => {
              const m = eventMeta(ev.event_type);
              const isFlagged = flagged.has(ev.id);
              return (
                <div key={ev.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface/50 transition-colors group">
                  {/* Dot */}
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${m.dot}`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-muted">{fmt(ev.occurred_at)}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.color} ${m.bg}`}>
                        {m.label}
                      </span>
                      <span className="text-xs font-semibold text-text truncate max-w-xs">
                        {fileName(ev)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-muted">
                        <span className="text-accent font-medium">{ev.actor_id}</span>
                        {" · "}
                        <span className="truncate max-w-[200px] inline-block align-bottom">{filePath(ev)}</span>
                      </span>
                      <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded font-mono">
                        {hostName(ev)}
                      </span>
                    </div>
                  </div>

                  {/* Flag button */}
                  <button
                    onClick={() => setFlagTarget(ev)}
                    title="Flag this event"
                    className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded-lg text-[10px] font-semibold border ${
                      isFlagged
                        ? "border-warn text-warn bg-warn/10"
                        : "border-border text-muted hover:border-warn hover:text-warn"
                    }`}
                  >
                    {isFlagged ? "Flagged" : "Flag"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Flag modal */}
      {flagTarget && (
        <FlagModal
          event={flagTarget}
          onClose={() => setFlagTarget(null)}
          onDone={() => {
            setFlagged((prev) => new Set([...prev, flagTarget.id]));
            setFlagTarget(null);
          }}
        />
      )}
    </div>
  );
}
