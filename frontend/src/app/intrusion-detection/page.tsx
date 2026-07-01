"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import IntrusionMap from "@/components/IntrusionMap";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getIntrusionStats, ApiError, IntrusionStats } from "@/lib/api-client";

// ── helpers ───────────────────────────────────────────────────────────────────

function threatLevel(total: number): { label: string; color: string; bg: string; border: string } {
  if (total === 0)   return { label: "CLEAR",    color: "text-[var(--safe)]",   bg: "bg-[var(--safe)]/10",   border: "border-[var(--safe)]/20"   };
  if (total < 10)    return { label: "LOW",       color: "text-[var(--accent)]", bg: "bg-[var(--accent)]/10", border: "border-[var(--accent)]/20" };
  if (total < 50)    return { label: "MEDIUM",    color: "text-[var(--warn)]",   bg: "bg-[var(--warn)]/10",   border: "border-[var(--warn)]/20"   };
  if (total < 100)   return { label: "HIGH",      color: "text-[var(--danger)]", bg: "bg-[var(--danger)]/10", border: "border-[var(--danger)]/20" };
  return               { label: "CRITICAL",  color: "text-[var(--danger)]", bg: "bg-[var(--danger)]/10", border: "border-[var(--danger)]/20" };
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
}

function fmtEvType(t: string) {
  return t.replace("auth.", "").replace("intrusion.", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[var(--surface)] ${className}`} />;
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPI({ label, value, sub, color = "text-[var(--accent)]" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)] mb-2">{label}</p>
      <p className={`text-3xl font-extrabold font-mono leading-none ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--muted)] mt-2">{sub}</p>}
    </div>
  );
}

// ── Country bar ───────────────────────────────────────────────────────────────

function CountryBar({ country, count, max }: { country: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-sm text-[var(--text)] truncate shrink-0">{country}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--surface)] overflow-hidden">
        <div className="h-full rounded-full bg-[var(--danger)] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-mono text-[var(--danger)] shrink-0">{count}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IntrusionDetectionPage() {
  const ready = useRequireAuth();
  const [stats, setStats] = useState<IntrusionStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    getIntrusionStats()
      .then(setStats)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  const threat = threatLevel(stats?.total_attempts ?? 0);
  const maxCountry = stats ? Math.max(...stats.countries.map(c => c.count), 1) : 1;
  const visibleAttempts = showAll ? (stats?.attempts ?? []) : (stats?.attempts ?? []).slice(0, 50);

  return (
    <NavBar>
      <main className="p-6 md:p-8 flex-1 max-w-6xl space-y-8 animate-fade-in">

        {/* Header + threat level */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Intrusion Detection</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Real authentication failures against this platform — rejected API keys and failed logins, each with GeoIP tracking.
            </p>
          </div>
          {stats && (
            <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${threat.bg} ${threat.border}`}>
              <span className={`w-2 h-2 rounded-full ${threat.label !== "CLEAR" ? "animate-pulse" : ""}`}
                style={{ backgroundColor: "currentColor", color: threat.color.replace("text-", "").replace("[", "").replace("]", "") }}
              />
              <span className={`text-xs font-black tracking-[0.2em] ${threat.color}`}>THREAT: {threat.label}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-xl px-4 py-3">
            <p className="text-sm text-[var(--danger)]">{error}</p>
          </div>
        )}

        {loading && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-64" />
          </div>
        )}

        {stats && !loading && (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPI
                label="Total Attempts"
                value={stats.total_attempts}
                sub="auth failures with real IPs"
                color="text-[var(--danger)]"
              />
              <KPI
                label="Unique IPs"
                value={stats.unique_ips}
                sub="distinct attacking sources"
                color="text-[var(--warn)]"
              />
              <KPI
                label="Countries"
                value={stats.countries.length}
                sub={stats.countries[0] ? `top: ${stats.countries[0].country}` : "no data yet"}
                color="text-[var(--iris)]"
              />
              <KPI
                label="Top Attacker"
                value={stats.top_ips[0]?.ip ?? "—"}
                sub={stats.top_ips[0] ? `${stats.top_ips[0].count} hits · ${stats.top_ips[0].country}` : "no data yet"}
                color="text-[var(--accent)]"
              />
            </div>

            {/* World map — shown prominently when attacks exist */}
            <Panel className="p-0 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Attack Origin Map
                </p>
                <span className="text-[10px] text-[var(--muted)]">
                  {stats.attempts.filter(a => a.latitude != null).length} geolocated
                </span>
              </div>
              <IntrusionMap attempts={stats.attempts} />
            </Panel>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Country breakdown */}
              <Panel className="p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)] mb-5">By Country</p>
                {stats.countries.length === 0 ? (
                  <p className="text-sm text-[var(--muted)] text-center py-6">No data yet.</p>
                ) : (
                  <div className="space-y-3">
                    {stats.countries.map(c => (
                      <CountryBar key={c.country} country={c.country} count={c.count} max={maxCountry} />
                    ))}
                  </div>
                )}
              </Panel>

              {/* Top attacking IPs */}
              <Panel className="p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)] mb-5">Top Attacking IPs</p>
                {stats.top_ips.length === 0 ? (
                  <p className="text-sm text-[var(--muted)] text-center py-6">No data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {stats.top_ips.slice(0, 10).map((ip, i) => (
                      <div key={ip.ip} className="flex items-center gap-3 group">
                        <span className="text-[10px] font-bold text-[var(--muted)] font-mono w-4 text-right shrink-0">{i + 1}</span>
                        <span className="font-mono text-xs text-[var(--warn)] flex-1">{ip.ip}</span>
                        <span className="text-xs text-[var(--muted)] truncate max-w-[120px]">
                          {[ip.city, ip.country].filter(Boolean).join(", ")}
                        </span>
                        <span className="text-sm font-bold font-mono text-[var(--danger)] w-8 text-right shrink-0">{ip.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            {/* Full attempt log */}
            <Panel className="p-0 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Attempt Log
                  <span className="ml-2 normal-case tracking-normal text-[var(--text)]">{stats.attempts.length}</span>
                </p>
                <span className="text-[10px] text-[var(--muted)]">most recent first</span>
              </div>

              {stats.attempts.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-[var(--muted)]">
                  No failed authentication attempts recorded yet.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="text-left border-b border-[var(--border)] bg-[var(--surface)]">
                          <th className="py-2.5 px-4 text-[10px] uppercase tracking-wide text-[var(--muted)] font-bold">Time</th>
                          <th className="py-2.5 px-4 text-[10px] uppercase tracking-wide text-[var(--muted)] font-bold">IP Address</th>
                          <th className="py-2.5 px-4 text-[10px] uppercase tracking-wide text-[var(--muted)] font-bold">Location</th>
                          <th className="py-2.5 px-4 text-[10px] uppercase tracking-wide text-[var(--muted)] font-bold">Coordinates</th>
                          <th className="py-2.5 px-4 text-[10px] uppercase tracking-wide text-[var(--muted)] font-bold">Target User</th>
                          <th className="py-2.5 px-4 text-[10px] uppercase tracking-wide text-[var(--muted)] font-bold">Attack Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {visibleAttempts.map((a, i) => (
                          <tr key={i} className="hover:bg-[var(--surface)] transition-colors">
                            <td className="py-2.5 px-4 font-mono text-xs text-[var(--muted)] whitespace-nowrap">
                              {fmtTime(a.occurred_at)}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-xs text-[var(--warn)] whitespace-nowrap">
                              {a.ip ?? <span className="text-[var(--muted)]">—</span>}
                            </td>
                            <td className="py-2.5 px-4 text-sm whitespace-nowrap">
                              {a.city ? (
                                <span>{a.city}, <span className="text-[var(--muted)]">{a.country}</span></span>
                              ) : (
                                <span className="text-[var(--muted)]">{a.country}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-[10px] text-[var(--muted)] whitespace-nowrap">
                              {a.latitude != null && a.longitude != null
                                ? `${a.latitude.toFixed(3)}, ${a.longitude.toFixed(3)}`
                                : "—"}
                            </td>
                            <td className="py-2.5 px-4 text-sm">
                              {a.actor_id
                                ? <span className="font-mono text-xs text-[var(--text)]">{a.actor_id}</span>
                                : <span className="text-[var(--muted)]">—</span>}
                            </td>
                            <td className="py-2.5 px-4">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/20">
                                {fmtEvType(a.event_type)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {stats.attempts.length > 50 && (
                    <div className="px-5 py-3 border-t border-[var(--border)] flex items-center justify-between">
                      <span className="text-xs text-[var(--muted)]">
                        Showing {showAll ? stats.attempts.length : Math.min(50, stats.attempts.length)} of {stats.attempts.length}
                      </span>
                      <button
                        onClick={() => setShowAll(v => !v)}
                        className="text-xs font-semibold text-[var(--accent)] hover:underline"
                      >
                        {showAll ? "Show less" : `Show all ${stats.attempts.length}`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </Panel>
          </>
        )}

        {stats && stats.total_attempts === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--surface)] flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--safe)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <p className="text-base font-semibold text-[var(--text)]">No attacks detected</p>
            <p className="text-sm text-[var(--muted)] mt-1">All authentication attempts have been successful. The map will populate if intrusion attempts occur.</p>
          </div>
        )}

      </main>
    </NavBar>
  );
}
