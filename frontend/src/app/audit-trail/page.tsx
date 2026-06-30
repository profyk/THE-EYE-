"use client";

import { useState } from "react";
import { getAuditTrail, flagEvent, EventRead } from "@/lib/api-client";

// ── Narrative builder ─────────────────────────────────────────────────────────

const VERB: Record<string, string> = {
  "file.created":            "created",
  "file.deleted":            "deleted",
  "file.modified":           "modified",
  "file.renamed":            "renamed",
  "file.copied_to_usb":      "copied to USB →",
  "file.accessed":           "accessed",
  "file.permissions_changed":"changed permissions on",
  "usb.connected":           "connected USB drive",
  "usb.disconnected":        "removed USB drive",
  "device.connected":        "connected device",
  "auth.login":              "logged in",
  "auth.logout":             "logged out",
  "auth.ntlm":               "authenticated (NTLM) on",
  "process.execution":       "executed process",
  "task.created":            "created scheduled task",
  "task.deleted":            "deleted scheduled task",
  "task.updated":            "updated scheduled task",
  "task.enabled":            "enabled scheduled task",
  "task.disabled":           "disabled scheduled task",
  "user.created":            "created user account",
  "user.deleted":            "deleted user account",
  "group.member_added":      "added member to group",
  "group.member_removed":    "removed member from group",
  "privilege.use":           "used privilege",
  "system.startup":          "started machine",
  "system.shutdown":         "shut down machine",
  "service.installed":       "installed service",
  "powershell.script_block": "executed PowerShell script on",
};

function narrative(ev: EventRead): { verb: string; target: string; machine: string } {
  const meta = (ev.metadata ?? {}) as Record<string, string>;
  const verb = VERB[ev.event_type] ?? ev.event_type;
  const target =
    meta.file_name ?? meta.task_name ?? meta.process_name ??
    meta.device_description ?? meta.volume_label ??
    ev.target_id ?? "";
  const machine = meta.host ?? ev.origin_host ?? "";
  return { verb, target, machine };
}

function severityDot(sev: string) {
  const map: Record<string, string> = {
    critical: "bg-danger ring-2 ring-danger/30",
    high:     "bg-warn",
    info:     "bg-accent",
  };
  return map[sev] ?? "bg-muted";
}

function severityBg(sev: string) {
  const map: Record<string, string> = {
    critical: "border-danger/40 bg-danger/5",
    high:     "border-warn/40 bg-warn/5",
    info:     "border-border bg-panel",
  };
  return map[sev] ?? "border-border bg-panel";
}

function fmtDate(ts: string) {
  try { return new Date(ts).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" }); }
  catch { return ts; }
}

function fmtTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return ts; }
}

function groupByDay(events: EventRead[]): [string, EventRead[]][] {
  const days = new Map<string, EventRead[]>();
  for (const ev of events) {
    const day = fmtDate(ev.occurred_at);
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(ev);
  }
  return Array.from(days.entries());
}

// ── Flag pill ─────────────────────────────────────────────────────────────────

function FlagPill({
  eventId,
  onFlagged,
}: {
  eventId: string;
  onFlagged: (id: string, type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    const colors: Record<string, string> = {
      suspicious: "text-warn bg-warn/10 border-warn/40",
      unlawful:   "text-danger bg-danger/10 border-danger/40",
      evidence:   "text-iris bg-iris/10 border-iris/40",
      cleared:    "text-safe bg-safe/10 border-safe/40",
    };
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${colors[done] ?? ""}`}>
        {done}
      </span>
    );
  }

  async function submit(type: "suspicious" | "unlawful" | "evidence" | "cleared") {
    setSaving(true);
    try {
      await flagEvent(eventId, type, note || undefined);
      setDone(type);
      onFlagged(eventId, type);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] font-semibold text-muted hover:text-warn border border-transparent hover:border-warn/40 px-2 py-0.5 rounded-full transition-colors"
      >
        ⚑ Flag
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-20 bg-panel border border-border rounded-xl p-3 w-56 shadow-2xl">
          <textarea
            className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-text placeholder-muted resize-none h-16 mb-2 focus:outline-none focus:border-accent"
            placeholder="Optional note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-1">
            {(["suspicious", "unlawful", "evidence", "cleared"] as const).map((t) => (
              <button
                key={t}
                disabled={saving}
                onClick={() => submit(t)}
                className={`py-1 rounded-lg text-[10px] font-bold capitalize border transition-colors disabled:opacity-50 ${
                  t === "unlawful"  ? "border-danger/50 text-danger hover:bg-danger/10" :
                  t === "suspicious"? "border-warn/50 text-warn hover:bg-warn/10" :
                  t === "evidence"  ? "border-iris/50 text-iris hover:bg-iris/10" :
                                      "border-safe/50 text-safe hover:bg-safe/10"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="mt-1 w-full text-[10px] text-muted hover:text-text py-0.5"
          >
            cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AuditTrailPage() {
  const [query, setQuery] = useState("");
  const [machine, setMachine] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [events, setEvents] = useState<EventRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [err, setErr] = useState("");
  const [flagMap, setFlagMap] = useState<Record<string, string>>({});

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setErr("");
    try {
      const data = await getAuditTrail({
        subject: query.trim(),
        machine: machine || undefined,
        from:    from    || undefined,
        to:      to      || undefined,
        limit:   500,
      });
      setEvents(data);
      setSearched(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  const days = groupByDay(events);

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 gap-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text">Audit Trail</h1>
        <p className="text-xs text-muted mt-0.5">
          Back-trail any person, file, document, or machine — see exactly what happened and when
        </p>
      </div>

      {/* Search bar */}
      <div className="bg-panel border border-border rounded-xl p-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              className="w-full bg-deep border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-text placeholder-muted focus:outline-none focus:border-accent transition-colors"
              placeholder="Search by person, file name, machine, document reference…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
          </div>
          <button
            onClick={search}
            disabled={loading || !query.trim()}
            className="px-5 py-2 rounded-lg bg-accent text-void text-sm font-semibold hover:bg-accent-dim disabled:opacity-40 transition-colors"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {/* Secondary filters */}
        <div className="flex gap-2 flex-wrap">
          <input
            className="bg-deep border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent w-44"
            placeholder="Machine / hostname…"
            value={machine}
            onChange={(e) => setMachine(e.target.value)}
          />
          <input
            type="date"
            className="bg-deep border border-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className="self-center text-xs text-muted">→</span>
          <input
            type="date"
            className="bg-deep border border-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        {/* Example searches */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-[10px] text-muted uppercase tracking-wide font-semibold">Try:</span>
          {["John", "passport_application", "visa", "Kabelo"].map((ex) => (
            <button
              key={ex}
              onClick={() => { setQuery(ex); }}
              className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted hover:border-accent hover:text-accent transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="text-xs text-danger">{err}</p>}

      {/* Empty state before first search */}
      {!searched && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="opacity-30">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 9v6M9 12h6" />
          </svg>
          <p className="text-sm font-medium">Search to reveal the full audit trail</p>
          <p className="text-xs text-center max-w-sm opacity-70">
            Enter a person's name, file name, document reference, or machine name
            to see every action related to it — across all enrolled machines.
          </p>
        </div>
      )}

      {/* Results */}
      {searched && events.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted">No events found for <strong className="text-text">"{query}"</strong></p>
        </div>
      )}

      {days.length > 0 && (
        <div className="flex-1 overflow-y-auto flex flex-col gap-6 pb-4">
          {/* Summary banner */}
          <div className="bg-accent/5 border border-accent/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <svg className="text-accent w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <p className="text-sm text-text">
              Found <span className="font-bold text-accent">{events.length}</span> event{events.length !== 1 ? "s" : ""}{" "}
              matching <span className="font-bold">"{query}"</span>
              {machine ? ` on ${machine}` : ""} across{" "}
              <span className="font-bold">{days.length}</span> day{days.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Timeline by day */}
          {days.map(([day, dayEvents]) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-bold tracking-widest text-muted uppercase">{day}</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="relative pl-6">
                {/* Vertical line */}
                <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />

                <div className="flex flex-col gap-3">
                  {dayEvents.map((ev) => {
                    const { verb, target, machine: host } = narrative(ev);
                    const flag = flagMap[ev.id];
                    return (
                      <div key={ev.id} className="relative group">
                        {/* Timeline dot */}
                        <div className={`absolute -left-4 top-3 w-2.5 h-2.5 rounded-full ${severityDot(ev.severity)}`} />

                        {/* Event card */}
                        <div className={`border rounded-xl px-4 py-3 transition-colors hover:border-accent/40 ${severityBg(ev.severity)}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {/* Narrative */}
                              <p className="text-sm text-text leading-snug">
                                <span className="font-semibold text-accent">{ev.actor_id}</span>
                                {" "}
                                <span className="text-muted">{verb}</span>
                                {" "}
                                {target && (
                                  <span className="font-medium text-text truncate inline-block max-w-xs align-bottom" title={target}>
                                    {target}
                                  </span>
                                )}
                                {host && (
                                  <span className="text-muted"> on{" "}
                                    <span className="font-mono text-xs text-text/80">{host}</span>
                                  </span>
                                )}
                              </p>

                              {/* Meta row */}
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                <span className="font-mono text-[10px] text-muted">{fmtTime(ev.occurred_at)}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                  ev.severity === "critical" ? "text-danger bg-danger/10" :
                                  ev.severity === "high"     ? "text-warn bg-warn/10" :
                                                               "text-muted bg-surface"
                                }`}>
                                  {ev.event_type}
                                </span>
                                {flag && (
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${
                                    flag === "unlawful"   ? "text-danger border-danger/40 bg-danger/5" :
                                    flag === "suspicious" ? "text-warn border-warn/40 bg-warn/5" :
                                    flag === "evidence"   ? "text-iris border-iris/40 bg-iris/5" :
                                                            "text-safe border-safe/40 bg-safe/5"
                                  }`}>
                                    {flag}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Flag inline */}
                            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <FlagPill
                                eventId={ev.id}
                                onFlagged={(id, type) =>
                                  setFlagMap((prev) => ({ ...prev, [id]: type }))
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
