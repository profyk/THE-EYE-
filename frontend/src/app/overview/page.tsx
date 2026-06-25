"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import StatCard from "@/components/StatCard";
import EventTable from "@/components/EventTable";
import Panel from "@/components/Panel";
import ProgressBar from "@/components/ProgressBar";
import { StatusTone } from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  getOverviewStats,
  searchEvents,
  listAlerts,
  getActorRiskScores,
  ApiError,
  OverviewStats,
  AlertRead,
  ActorRiskScore,
} from "@/lib/api-client";
import { EventRead } from "@/types/event";

const SEVERITY_TONE: Record<string, StatusTone> = {
  critical: "danger",
  high: "warn",
  info: "muted",
};

const DOT_BG: Record<StatusTone, string> = {
  accent: "bg-accent",
  danger: "bg-danger",
  warn: "bg-warn",
  safe: "bg-safe",
  iris: "bg-iris",
  muted: "bg-muted",
};

function riskTone(score: number): StatusTone {
  if (score >= 50) return "danger";
  if (score >= 20) return "warn";
  return "safe";
}

export default function OverviewPage() {
  const ready = useRequireAuth();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [recent, setRecent] = useState<EventRead[]>([]);
  const [alerts, setAlerts] = useState<AlertRead[]>([]);
  const [riskScores, setRiskScores] = useState<ActorRiskScore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see events/page.tsx
    setLoading(true);
    Promise.all([getOverviewStats(), searchEvents({ limit: 10 }), listAlerts(), getActorRiskScores()])
      .then(([s, events, alertsData, scores]) => {
        setStats(s);
        setRecent(events);
        setAlerts(alertsData.filter((a) => a.status === "open").slice(0, 6));
        setRiskScores(scores.slice(0, 6));
      })
      .catch((e: ApiError) => setError(e.message || "Failed to load overview"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="p-6 flex-1 space-y-6">
        <h1 className="text-lg font-semibold">Overview</h1>
        {loading && <p className="text-sm text-muted">Loading...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Events Today" value={stats.events_today} tone="accent" />
            <StatCard label="Critical Flags" value={stats.critical_flags} tone="danger" />
            <StatCard label="High Risk Users" value={stats.high_risk_users} tone="warn" />
            <StatCard label="Active Sources" value={stats.active_sources} tone="safe" />
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
            <Panel className="overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <span className="text-sm font-bold tracking-wide">RECENT ACTIVITY</span>
                <Link href="/events" className="text-xs text-accent hover:underline">
                  View all →
                </Link>
              </div>
              <EventTable events={recent} />
            </Panel>

            <Panel className="overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <span className="text-sm font-bold tracking-wide">LIVE ALERTS</span>
              </div>
              {alerts.length === 0 ? (
                <EmptyState>No open alerts.</EmptyState>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {alerts.map((a) => {
                    const tone = SEVERITY_TONE[a.severity] ?? "muted";
                    return (
                      <div key={a.key} className={tone === "danger" ? "bg-danger/10" : tone === "warn" ? "bg-warn/10" : ""}>
                        <div className="flex items-start gap-2 p-3.5">
                          <span className={`w-2 h-2 rounded-full mt-1 shrink-0 animate-pulse-glow ${DOT_BG[tone]}`} />
                          <div>
                            <p className="text-xs leading-relaxed">{a.message}</p>
                            <p className="text-[10px] text-muted mt-0.5">{new Date(a.detected_at).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        )}

        {!loading && !error && riskScores.length > 0 && (
          <Panel className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <span className="text-sm font-bold tracking-wide">HIGH RISK USERS — RISK SCORE</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
              {riskScores.map((s) => {
                const tone = riskTone(s.risk_score);
                return (
                  <div key={s.actor_id} className="bg-panel p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-xs font-bold text-muted shrink-0">
                        {s.actor_id.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="font-bold text-sm">{s.actor_id}</p>
                        <p className="text-xs text-muted">{s.total_events} events</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <ProgressBar value={s.risk_score} tone={tone} className="flex-1" />
                      <span className={`text-sm font-extrabold font-mono ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-safe"}`}>
                        {s.risk_score}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </main>
    </div>
  );
}
