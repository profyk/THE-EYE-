"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import {
  listAnnouncements, createAnnouncement, toggleAnnouncement, deleteAnnouncement,
  StaffAnnouncement, ApiError,
} from "@/lib/api-client";

const SEV_STYLES: Record<string, { badge: string; border: string }> = {
  info:     { badge: "bg-accent/10 text-accent border-accent/30",    border: "border-l-accent" },
  warning:  { badge: "bg-warn/10 text-warn border-warn/30",          border: "border-l-warn" },
  critical: { badge: "bg-danger/10 text-danger border-danger/30",    border: "border-l-danger" },
};

function fmt(d: string) {
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AnnouncementsPage() {
  const ready = useRequireAuth();
  const [announcements, setAnnouncements] = useState<StaffAnnouncement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">("info");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  useEffect(() => {
    if (!ready) return;
    listAnnouncements().then(setAnnouncements).catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"));
  }, [ready]);

  async function handleToggle(ann: StaffAnnouncement) {
    setActing(ann.id);
    try {
      const updated = await toggleAnnouncement(ann.id, !ann.is_active);
      setAnnouncements((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed"); }
    finally { setActing(null); }
  }

  async function handleDelete(id: string) {
    setActing(id);
    try {
      await deleteAnnouncement(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Delete failed"); }
    finally { setActing(null); }
  }

  async function handlePost() {
    setPostError("");
    if (!title.trim() || !body.trim()) { setPostError("Title and body are required"); return; }
    setPosting(true);
    try {
      const ann = await createAnnouncement(title.trim(), body.trim(), severity);
      setAnnouncements((prev) => [ann, ...prev]);
      setShowModal(false); setTitle(""); setBody(""); setSeverity("info");
    } catch (e) { setPostError(e instanceof ApiError ? e.message : "Failed to post"); }
    finally { setPosting(false); }
  }

  const active = announcements.filter((a) => a.is_active);
  const inactive = announcements.filter((a) => !a.is_active);

  if (!ready) return null;

  return (
    <AppShell>
      <main className="p-8 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">Announcements</h1>
            <p className="text-sm text-muted mt-1">
              <span className="text-safe font-semibold">{active.length}</span> active ·{" "}
              <span className="text-muted">{inactive.length}</span> archived
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-accent text-void text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            + Post Announcement
          </button>
        </div>

        {error && <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">{error}</div>}

        {announcements.length === 0 && !error && (
          <Panel>
            <div className="py-16 text-center text-muted">
              <p className="text-sm font-medium">No announcements yet</p>
              <p className="text-xs mt-1">Post platform-wide announcements to notify all clients</p>
            </div>
          </Panel>
        )}

        {/* Active */}
        {active.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted px-1">Active</p>
            {active.map((ann) => {
              const style = SEV_STYLES[ann.severity] ?? SEV_STYLES.info;
              return (
                <div key={ann.id} className={`bg-panel border-l-4 border border-border rounded-xl px-5 py-4 ${style.border}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${style.badge}`}>
                          {ann.severity}
                        </span>
                        <h3 className="text-sm font-semibold text-text">{ann.title}</h3>
                      </div>
                      <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">{ann.body}</p>
                      <p className="text-[10px] text-muted mt-2">
                        Posted by <span className="text-text font-mono">{ann.created_by}</span> · {fmt(ann.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggle(ann)}
                        disabled={acting === ann.id}
                        className="text-xs font-semibold px-3 py-1 rounded-lg text-warn hover:bg-warn/10 bg-warn/5 transition-colors disabled:opacity-50"
                      >
                        {acting === ann.id ? "…" : "Deactivate"}
                      </button>
                      <button
                        onClick={() => handleDelete(ann.id)}
                        disabled={acting === ann.id}
                        className="text-xs font-semibold px-3 py-1 rounded-lg text-danger hover:bg-danger/10 bg-danger/5 transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Archived */}
        {inactive.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted px-1">Archived</p>
            {inactive.map((ann) => (
              <div key={ann.id} className="bg-panel border border-border rounded-xl px-5 py-4 opacity-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-border text-muted uppercase">{ann.severity}</span>
                      <h3 className="text-sm font-semibold text-muted line-through">{ann.title}</h3>
                    </div>
                    <p className="text-[10px] text-muted">By {ann.created_by} · {fmt(ann.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(ann)}
                      disabled={acting === ann.id}
                      className="text-xs font-semibold px-3 py-1 rounded-lg text-safe hover:bg-safe/10 bg-safe/5 transition-colors disabled:opacity-50"
                    >
                      {acting === ann.id ? "…" : "Reactivate"}
                    </button>
                    <button
                      onClick={() => handleDelete(ann.id)}
                      disabled={acting === ann.id}
                      className="text-xs font-semibold px-3 py-1 rounded-lg text-danger hover:bg-danger/10 bg-danger/5 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Post Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-panel border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="font-semibold text-text mb-4">Post Announcement</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted uppercase tracking-wider">Title</label>
                <input
                  className="mt-1 w-full bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="e.g. Scheduled maintenance on 30 Jun 02:00 UTC"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wider">Body</label>
                <textarea
                  className="mt-1 w-full bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none h-28"
                  placeholder="Full announcement details…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wider">Severity</label>
                <div className="flex gap-2 mt-1">
                  {(["info", "warning", "critical"] as const).map((s) => {
                    const st = SEV_STYLES[s];
                    return (
                      <button
                        key={s}
                        onClick={() => setSeverity(s)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize border transition-colors ${
                          severity === s ? `${st.badge}` : "border-border text-muted hover:border-accent hover:text-text"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              {postError && <p className="text-xs text-danger">{postError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handlePost}
                disabled={posting}
                className="flex-1 py-2 bg-accent text-void text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {posting ? "Posting…" : "Post Announcement"}
              </button>
              <button
                onClick={() => { setShowModal(false); setTitle(""); setBody(""); setSeverity("info"); setPostError(""); }}
                className="px-4 py-2 border border-border text-sm text-muted rounded-lg hover:text-text transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
