"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import EmptyState from "@/components/EmptyState";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getActivityHeatmap, ApiError, HeatmapCell } from "@/lib/api-client";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildGrid(cells: HeatmapCell[]): number[][] {
  // [day 0..6][hour 0..23]
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  cells.forEach((c) => { grid[c.day][c.hour] = c.count; });
  return grid;
}

function cellOpacity(count: number, max: number): number {
  if (max === 0 || count === 0) return 0;
  return 0.08 + (count / max) * 0.85;
}

export default function ActivityPage() {
  const ready = useRequireAuth();
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getActivityHeatmap()
      .then(setCells)
      .catch((e: ApiError) => setError(e.message || "Failed to load heatmap"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  const grid = buildGrid(cells);
  const max = Math.max(...cells.map((c) => c.count), 1);
  const isEmpty = cells.length === 0;

  // Peak analysis
  const peakCell = cells.reduce((a, b) => (b.count > a.count ? b : a), { day: 0, hour: 0, count: 0 });
  const peakByDay = DAYS.map((_, d) => ({
    day: d,
    total: grid[d].reduce((s, v) => s + v, 0),
    peakHour: grid[d].indexOf(Math.max(...grid[d])),
  }));

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="p-6 flex-1">
        <h1 className="text-lg font-semibold mb-1">Activity Heatmap</h1>
        <p className="text-sm text-muted mb-6">
          Event density by hour of day and day of week across all recorded events. Darker cells = more activity.
          Off-hours spikes here often indicate unauthorized access.
        </p>

        {loading && <p className="text-sm text-muted">Loading...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        {!loading && !error && (
          <>
            {isEmpty ? (
              <EmptyState>No events recorded yet.</EmptyState>
            ) : (
              <>
                {/* Summary chips */}
                <div className="flex flex-wrap gap-3 mb-6 text-xs">
                  <span className="bg-panel border border-border rounded-lg px-3 py-1.5">
                    Peak: <strong className="text-warn">{DAYS[peakCell.day]} {String(peakCell.hour).padStart(2, "0")}:00</strong>
                    {" "}({peakCell.count} events)
                  </span>
                  <span className="bg-panel border border-border rounded-lg px-3 py-1.5">
                    Busiest day: <strong className="text-accent">{DAYS[peakByDay.reduce((a, b) => (b.total > a.total ? b : a)).day]}</strong>
                  </span>
                </div>

                <Panel className="p-5 overflow-x-auto">
                  {/* Hour labels header */}
                  <div className="flex mb-1" style={{ paddingLeft: "44px" }}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <div
                        key={h}
                        className="text-center text-[9px] text-muted font-mono"
                        style={{ width: "calc(100% / 24)", minWidth: "18px" }}
                      >
                        {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                      </div>
                    ))}
                  </div>

                  {/* Grid rows */}
                  {DAYS.map((day, d) => (
                    <div key={day} className="flex items-center mb-0.5">
                      <span className="text-[10px] text-muted w-11 shrink-0 font-semibold">{day}</span>
                      {Array.from({ length: 24 }, (_, h) => {
                        const count = grid[d][h];
                        const opacity = cellOpacity(count, max);
                        return (
                          <div
                            key={h}
                            title={`${day} ${String(h).padStart(2, "0")}:00 — ${count} events`}
                            className="rounded-sm transition-all cursor-default"
                            style={{
                              width: "calc(100% / 24)",
                              minWidth: "18px",
                              height: "28px",
                              backgroundColor: `rgba(0, 212, 255, ${opacity})`,
                              margin: "0 1px",
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}

                  {/* Legend */}
                  <div className="flex items-center gap-2 mt-4 ml-11">
                    <span className="text-[10px] text-muted">Low</span>
                    <div className="flex gap-0.5">
                      {[0.08, 0.25, 0.45, 0.65, 0.93].map((op) => (
                        <div
                          key={op}
                          className="w-5 h-3 rounded-sm"
                          style={{ backgroundColor: `rgba(0, 212, 255, ${op})` }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-muted">High</span>
                  </div>
                </Panel>

                {/* Per-day breakdown */}
                <Panel className="p-5 mt-5 overflow-x-auto">
                  <p className="text-xs font-bold tracking-wide text-muted uppercase mb-4">Peak hour by day</p>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left border-b border-border">
                        <th className="py-2 pr-4 text-xs uppercase tracking-wide text-muted font-semibold">Day</th>
                        <th className="py-2 pr-4 text-xs uppercase tracking-wide text-muted font-semibold">Total events</th>
                        <th className="py-2 text-xs uppercase tracking-wide text-muted font-semibold">Peak hour</th>
                      </tr>
                    </thead>
                    <tbody>
                      {peakByDay
                        .filter((r) => r.total > 0)
                        .sort((a, b) => b.total - a.total)
                        .map((r) => (
                          <tr key={r.day} className="border-b border-border last:border-0">
                            <td className="py-2 pr-4 font-semibold">{DAYS[r.day]}</td>
                            <td className="py-2 pr-4 font-mono">{r.total}</td>
                            <td className="py-2 text-warn font-mono">
                              {String(r.peakHour).padStart(2, "0")}:00
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </Panel>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
