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
  high:     "warn",
  info:     "muted",
};

const ALERT_BAR: Record<StatusTone, string> = {
  danger: "bg-danger",
  warn:   "bg-warn",
  muted:  "bg-border",
  accent: "bg-accent",
  safe:   "bg-safe",
  iris:   "bg-iris",
};

const ALERT_ROW_BG: Record<StatusTone, string> = {
  danger: "bg-danger/5",
  warn:   "bg-warn/5",
  muted:  "",
  accent: "",
  safe:   "",
  iris:   "",
};

const SEVERITY_TEXT: Record<StatusTone, string> = {
  danger: "text-danger",
  warn:   "text-warn",
  muted:  "text-muted",
  accent: "text-accent",
  safe:   "text-safe",
  iris:   "text-iris",
};

function riskTone(score: number): StatusTone {
  if (score >= 50) return "danger";
  if (score >= 20) return "warn";
  return "safe";
}

export default function OverviewPage() {
  const ready = useRequireAuth();
  const [stats, setStats]           = useState<OverviewStats | null>(null);
  const [recent, setRecent]         = useState<EventRead[]>([]);
  const [alerts, setAlerts]         = useState<AlertRead[]>([]);
  const [riskScores, setRiskScores] = useState<ActorRiskScore[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [now, setNow]               = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all([getOverviewStats(), searchEvents({ limit: 10 }), listAlerts(), getActorRiskScores()])
      .then(([s, events, alertsData, scores]) => {
        setStats(s);
        setRecent(events);
        setAlerts(alertsData.filter((a) => a.status === "open").slice(0, 8));
        setRiskScores(scores.slice(0, 6));
      })
      .catch((e: ApiError) => setError(e.message || "Failed to load overview"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  return (
    <NavBar>
      <main className="p-6 flex-1 space-y-6">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Overview</h1>
            <p className="text-xs text-muted mt-0.5">Real-time monitoring &amp; accountability</p>
          </div>
          {now && (
            <span className="text-[11px] text-muted font-mono hidden sm:block">
              {now.toLocaleString(undefined, {
                weekday: "short", month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {loading && <p className="text-sm text-muted">Loading…</p>}
        {error   && <p className="text-sm text-danger">{error}</p>}

        {/* ── Stat cards ──────────────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Events Today"    value={stats.events_today}   tone="accent" />
            <StatCard label="Critical Flags"  value={stats.critical_flags} tone="danger" />
            <StatCard label="High Risk Users" value={stats.high_risk_users} tone="warn"  />
            <StatCard label="Active Sources"  value={stats.active_sources} tone="safe"   />
          </div>
        )}

        {/* ── Main content: activity + alerts ─────────────────────────── */}
        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">

            {/* Recent activity */}
            <Panel className="overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <span className="text-xs font-bold tracking-[0.1em] uppercase">Recent Activity</span>
                <Link href="/events" className="text-[11px] text-accent hover:underline">
                  View all →
                </Link>
              </div>
              <EventTable events={recent} noBorder />
            </Panel>

            {/* Live alerts */}
            <Panel className="overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <span className="text-xs font-bold tracking-[0.1em] uppercase">Live Alerts</span>
                {alerts.length > 0 && (
                  <Link href="/alerts" className="text-[11px] text-accent hover:underline">
                    All alerts →
                  </Link>
                )}
              </div>

              {alerts.length === 0 ? (
                <EmptyState>No open alerts.</EmptyState>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {alerts.map((a) => {
                    const tone = SEVERITY_TONE[a.severity] ?? "muted";
                    return (
                      <div key={a.key} className={`flex ${ALERT_ROW_BG[tone]}`}>
                        <div className={`w-[3px] shrink-0 ${ALERT_BAR[tone]}`} />
                        <div className="flex-1 px-4 py-3 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs leading-relaxed flex-1">{a.message}</p>
                            <span className={`text-[9px] font-bold uppercase tracking-wide shrink-0 mt-0.5 ${SEVERITY_TEXT[tone]}`}>
                              {a.severity}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted mt-1">
                            {a.actor_id} · {new Date(a.detected_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        )}

        {/* ── Risk scores ─────────────────────────────────────────────── */}
        {!loading && !error && riskScores.length > 0 && (
          <Panel className="overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-bold tracking-[0.1em] uppercase">High Risk Users</span>
              <Link href="/users-risk" className="text-[11px] text-accent hover:underline">
                Full report →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {riskScores.map((s, idx) => {
                const tone = riskTone(s.risk_score);
                const toneText = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-safe";
                return (
                  <div key={s.actor_id} className="flex items-center gap-3 p-4">
                    <span className="text-xs font-mono text-muted w-5 shrink-0 text-right">
                      #{idx + 1}
                    </span>
                    <span className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-xs font-bold text-muted shrink-0">
                      {s.actor_id.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="font-bold text-sm truncate">{s.actor_id}</p>
                        <span className={`text-sm font-extrabold font-mono ml-2 shrink-0 ${toneText}`}>
                          {s.risk_score}
                        </span>
                      </div>
                      <ProgressBar value={s.risk_score} tone={tone} className="w-full" />
                      <p className="text-[10px] text-muted mt-1.5">
                        {s.total_events} events · {s.failed_count} failed
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

      </main>
    </NavBar>
  );
}
