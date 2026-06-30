"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import {
  listTenants, getTenantNotes, addTenantNote, deleteTenantNote,
  TenantStats, StaffNote, ApiError,
} from "@/lib/api-client";

function fmtTime(d: string) {
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(d: string | null) {
  if (!d) return "No notes";
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function SupportPage() {
  const ready = useRequireAuth();
  const [tenants, setTenants] = useState<TenantStats[]>([]);
  const [selected, setSelected] = useState<TenantStats | null>(null);
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [noteSearch, setNoteSearch] = useState("");
  const [newNote, setNewNote] = useState("");
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState("");

  useEffect(() => {
    if (!ready) return;
    listTenants().then(setTenants).catch(() => {});
  }, [ready]);

  async function selectTenant(t: TenantStats) {
    setSelected(t);
    setNotes([]);
    setError(null);
    try {
      const loaded = await getTenantNotes(t.id);
      setNotes(loaded);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load notes"); }
  }

  async function handlePost() {
    if (!selected || !newNote.trim()) { setNoteError("Note cannot be empty"); return; }
    setNoteError("");
    setPosting(true);
    try {
      const note = await addTenantNote(selected.id, newNote.trim());
      setNotes((prev) => [note, ...prev]);
      setNewNote("");
    } catch (e) { setNoteError(e instanceof ApiError ? e.message : "Failed to post note"); }
    finally { setPosting(false); }
  }

  async function handleDelete(noteId: string) {
    if (!selected) return;
    setDeleting(noteId);
    try {
      await deleteTenantNote(selected.id, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Delete failed"); }
    finally { setDeleting(null); }
  }

  const filteredTenants = tenants.filter((t) =>
    t.name.toLowerCase().includes(noteSearch.toLowerCase()) ||
    t.slug.toLowerCase().includes(noteSearch.toLowerCase())
  );

  if (!ready) return null;

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-0px)] overflow-hidden">
        {/* Left: tenant list */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col bg-deep">
          <div className="px-4 py-5 border-b border-border">
            <h1 className="text-base font-bold text-text">Client Support</h1>
            <p className="text-xs text-muted mt-0.5">Select a client to view & add notes</p>
          </div>
          <div className="px-3 py-3 border-b border-border">
            <input
              type="text"
              placeholder="Search clients…"
              value={noteSearch}
              onChange={(e) => setNoteSearch(e.target.value)}
              className="w-full bg-surface border border-border text-text rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent/60"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredTenants.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTenant(t)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors ${
                  selected?.id === t.id ? "bg-accent/10 border-l-2 border-l-accent" : "hover:bg-surface/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium truncate ${selected?.id === t.id ? "text-accent" : "text-text"}`}>
                    {t.name}
                  </span>
                  <Badge variant={t.is_active ? "active" : "suspended"}>{t.is_active ? "Active" : "Suspended"}</Badge>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-muted font-mono">{t.slug}</span>
                  <span className="text-[10px] text-muted">
                    {/* We'd need last_note_at from backend — use created_at as fallback */}
                  </span>
                </div>
              </button>
            ))}
            {filteredTenants.length === 0 && (
              <p className="text-center text-muted text-xs py-8">No clients match</p>
            )}
          </div>
        </div>

        {/* Right: notes panel */}
        <div className="flex-1 flex flex-col bg-void overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="opacity-30">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <p className="text-sm font-medium">Select a client to view support notes</p>
              <p className="text-xs opacity-60 max-w-xs text-center">
                Internal notes are visible only to staff — use them to track issues, escalations, or context for this client.
              </p>
            </div>
          ) : (
            <>
              {/* Tenant header */}
              <div className="px-6 py-4 border-b border-border bg-deep flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-text">{selected.name}</h2>
                  <p className="text-xs text-muted font-mono">{selected.slug} · {selected.user_count} users · {selected.event_count_30d.toLocaleString()} events 30d</p>
                </div>
                <a href={`/tenants/${selected.id}`} className="text-xs text-accent hover:underline">View tenant →</a>
              </div>

              {error && <div className="mx-6 mt-4 bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>}

              {/* Notes thread */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                {notes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted gap-2">
                    <p className="text-sm">No notes yet</p>
                    <p className="text-xs">Be the first to add context for this client</p>
                  </div>
                ) : notes.map((n) => (
                  <div key={n.id} className="bg-panel border border-border rounded-xl px-4 py-3 group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-accent">{n.author_username}</span>
                        <span className="text-[10px] text-muted">{fmtTime(n.created_at)}</span>
                      </div>
                      <button
                        onClick={() => handleDelete(n.id)}
                        disabled={deleting === n.id}
                        className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-all disabled:opacity-50 text-xs"
                        title="Delete note"
                      >
                        {deleting === n.id ? "…" : "✕"}
                      </button>
                    </div>
                    <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">{n.body}</p>
                  </div>
                ))}
              </div>

              {/* Add note */}
              <div className="border-t border-border px-6 py-4 bg-deep">
                {noteError && <p className="text-xs text-danger mb-2">{noteError}</p>}
                <div className="flex gap-3">
                  <textarea
                    className="flex-1 bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none h-20 placeholder-muted"
                    placeholder="Add an internal note about this client…"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePost(); }}
                  />
                  <button
                    onClick={handlePost}
                    disabled={posting || !newNote.trim()}
                    className="px-4 py-2 self-end bg-accent text-void text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    {posting ? "Posting…" : "Post"}
                  </button>
                </div>
                <p className="text-[10px] text-muted mt-1">⌘↵ to post</p>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
