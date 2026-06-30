"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { listWhistleblowerReports, ApiError, WhistleblowerReportRead } from "@/lib/api-client";

const CATEGORY_TONE: Record<string, "danger" | "warn" | "muted"> = {
  corruption: "danger",
  fraud: "danger",
  abuse_of_power: "warn",
  safety: "warn",
  other: "muted",
};

export default function WhistleblowerInboxPage() {
  const ready = useRequireAuth();
  const [reports, setReports] = useState<WhistleblowerReportRead[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    listWhistleblowerReports()
      .then(setReports)
      .catch((e: ApiError) => setError(e.message || "Failed to load reports"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  return (
    <NavBar>
      <main className="p-6 flex-1 max-w-3xl">
        <h1 className="text-lg font-semibold mb-1">Whistleblower Reports</h1>
        <p className="text-sm text-muted mb-6">
          Anonymous submissions from the public report form. No IP address or identifying metadata is ever stored.
        </p>

        {loading && <p className="text-sm text-muted">Loading...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        {!loading && !error && (
          <div className="flex flex-col gap-3">
            {reports.map((r) => {
              const tone = CATEGORY_TONE[r.category] ?? "muted";
              const isOpen = expanded === r.id;
              return (
                <Panel key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <StatusBadge tone={tone}>{r.category.replace("_", " ")}</StatusBadge>
                        <span className="text-xs text-muted">{new Date(r.created_at).toLocaleString()}</span>
                        <span className="text-xs text-muted font-mono">{r.id.slice(0, 8)}</span>
                      </div>
                      {isOpen ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.report_text}</p>
                      ) : (
                        <p className="text-sm text-muted truncate">
                          {r.report_text.slice(0, 120)}{r.report_text.length > 120 ? "…" : ""}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      className="text-xs font-semibold text-accent hover:underline shrink-0 cursor-pointer"
                    >
                      {isOpen ? "Collapse" : "Read"}
                    </button>
                  </div>
                </Panel>
              );
            })}
            {reports.length === 0 && <EmptyState>No reports submitted yet.</EmptyState>}
          </div>
        )}
      </main>
    </NavBar>
  );
}
