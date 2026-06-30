"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { listAlerts, actOnAlert, ApiError, AlertRead } from "@/lib/api-client";

const SEVERITY_TEXT_COLOR: Record<string, string> = {
  critical: "text-danger",
  high: "text-warn",
  info: "text-muted",
};

const SEVERITY_BORDER_COLOR: Record<string, string> = {
  critical: "var(--danger)",
  high: "var(--warn)",
  info: "var(--border)",
};

const SEVERITY_ICON_BG: Record<string, string> = {
  critical: "bg-danger/15",
  high: "bg-warn/15",
  info: "bg-muted/15",
};

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🚨",
  high: "⚠️",
  info: "ℹ️",
};

export default function AlertsPage() {
  const ready = useRequireAuth();
  const [alerts, setAlerts] = useState<AlertRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    listAlerts()
      .then(setAlerts)
      .catch((e: ApiError) => setError(e.message || "Failed to load alerts"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see events/page.tsx
    refresh();
  }, [ready]);

  async function handleAction(alert: AlertRead, action: "acknowledged" | "escalated") {
    setActingOn(alert.key);
    try {
      await actOnAlert(alert.key, alert.rule_id, alert.actor_id, action);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update alert");
    } finally {
      setActingOn(null);
    }
  }

  if (!ready) return null;

  return (
    <NavBar>
      <main className="p-6 flex-1 max-w-3xl">
        <h1 className="text-lg font-semibold mb-1">Alerts</h1>
        <p className="text-sm text-muted mb-4">Real threshold rules evaluated against the live ledger -- not simulated.</p>
        {loading && <p className="text-sm text-muted">Loading...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        {!loading && !error && (
          <div className="flex flex-col gap-3">
            {alerts.map((a) => {
              const tone = SEVERITY_TEXT_COLOR[a.severity] ?? "text-muted";
              return (
                <Panel
                  key={a.key}
                  className="p-4.5 flex items-start gap-4"
                  style={{ borderColor: `${SEVERITY_BORDER_COLOR[a.severity] ?? SEVERITY_BORDER_COLOR.info}55` }}
                >
                  <span
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-lg shrink-0 ${SEVERITY_ICON_BG[a.severity] ?? SEVERITY_ICON_BG.info}`}
                  >
                    {SEVERITY_EMOJI[a.severity] ?? SEVERITY_EMOJI.info}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs font-extrabold uppercase tracking-wide ${tone}`}>{a.severity}</span>
                      <span className="text-xs text-muted">&middot; {new Date(a.detected_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm leading-relaxed">{a.message}</p>
                    <p className="text-xs text-muted mt-1">{a.rule_name}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {a.status === "open" ? (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          tone="muted"
                          disabled={actingOn === a.key}
                          onClick={() => handleAction(a, "acknowledged")}
                          className="text-xs px-2.5 py-1.5"
                        >
                          Acknowledge
                        </Button>
                        <Button
                          variant="outline"
                          tone="danger"
                          disabled={actingOn === a.key}
                          onClick={() => handleAction(a, "escalated")}
                          className="text-xs px-2.5 py-1.5"
                        >
                          Escalate
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs uppercase font-semibold text-muted">{a.status}</span>
                    )}
                  </div>
                </Panel>
              );
            })}
            {alerts.length === 0 && <EmptyState>No alerts -- nothing has crossed a threshold.</EmptyState>}
          </div>
        )}
      </main>
    </NavBar>
  );
}
