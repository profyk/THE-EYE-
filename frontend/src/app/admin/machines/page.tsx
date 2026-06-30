"use client";
import { useEffect, useState, useCallback } from "react";
import { listMachines, AgentMachine, ApiError } from "@/lib/api-client";
import { useRequireAuth } from "@/lib/useRequireAuth";

function timeAgo(d: string | null) {
  if (!d) return "Never";
  const diff = Date.now() - new Date(d).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const OS_LABEL: Record<string, string> = {
  windows: "Windows",
  linux: "Linux",
  darwin: "macOS",
};

export default function MachinesPage() {
  const ready = useRequireAuth();
  const [machines, setMachines] = useState<AgentMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMachines(await listMachines());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.status} — ${e.message}` : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [ready, load]);

  const online = machines.filter(m => m.is_online).length;
  const offline = machines.filter(m => !m.is_online).length;

  if (!ready) return null;

  return (
    <div className="p-8 max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Connected Machines</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Machines running THE EYE Agent. Status refreshes every 30 seconds.
          </p>
        </div>
        <button
          onClick={load}
          className="shrink-0 flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] px-3 py-2 rounded-lg transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Machines", value: machines.length, cls: "text-[var(--text)]" },
          { label: "Online", value: online, cls: "text-[var(--safe)]" },
          { label: "Offline", value: offline, cls: "text-[var(--muted)]" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 text-center">
            <p className={`text-3xl font-bold font-mono ${s.cls}`}>{s.value}</p>
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-[var(--danger)]/5 border border-[var(--danger)]/20 text-[var(--danger)] rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Machine list */}
      <div className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <p className="text-sm font-semibold text-[var(--text)]">Agent Machines</p>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-[var(--muted)] text-sm">Loading…</div>
        ) : machines.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--surface)] flex items-center justify-center mx-auto mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)]">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-[var(--text)]">No machines connected</p>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-sm mx-auto">
              Download and run THE EYE Agent on your machines. Configure it with your Tenant ID and API key.
            </p>
            <a href="/admin/api-keys"
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-[var(--accent)] hover:underline">
              Get API Keys →
            </a>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]/50">
            {machines.map(m => (
              <div key={m.id} className="px-6 py-4 flex items-center gap-4 hover:bg-[var(--surface)]/30 transition-colors">
                {/* Online dot */}
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  m.is_online
                    ? "bg-[var(--safe)] shadow-[0_0_6px_var(--safe)]"
                    : "bg-[var(--border)]"
                }`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {m.agent_label || m.hostname}
                    </p>
                    {m.agent_label && m.agent_label !== m.hostname && (
                      <p className="text-xs text-[var(--muted)]">({m.hostname})</p>
                    )}
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      m.is_online
                        ? "text-[var(--safe)] bg-[var(--safe)]/10 border-[var(--safe)]/20"
                        : "text-[var(--muted)] bg-[var(--surface)] border-[var(--border)]"
                    }`}>
                      {m.is_online ? "Online" : "Offline"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--muted)] mt-0.5 flex-wrap">
                    {m.os && <span>{OS_LABEL[m.os.toLowerCase()] ?? m.os}</span>}
                    {m.ip_address && <><span>·</span><span>{m.ip_address}</span></>}
                    {m.agent_version && <><span>·</span><span>v{m.agent_version}</span></>}
                    <span>·</span>
                    <span>Registered {fmt(m.registered_at)}</span>
                  </div>
                </div>

                {/* Last seen */}
                <div className="text-right shrink-0">
                  <p className="text-xs text-[var(--muted)]">Last seen</p>
                  <p className={`text-sm font-mono font-semibold ${
                    m.is_online ? "text-[var(--safe)]" : "text-[var(--muted)]"
                  }`}>
                    {timeAgo(m.last_heartbeat_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Setup instructions */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
        <p className="text-sm font-semibold text-[var(--text)] mb-3">Installing the Agent</p>
        <ol className="space-y-2 text-sm text-[var(--muted)] list-decimal list-inside">
          <li>
            Download{" "}
            <code className="font-mono text-xs bg-[var(--panel)] px-1.5 py-0.5 rounded text-[var(--text)]">eye-agent.exe</code>
            {" "}from your administrator
          </li>
          <li>
            Run{" "}
            <code className="font-mono text-xs bg-[var(--panel)] px-1.5 py-0.5 rounded text-[var(--text)]">eye-agent.exe --setup</code>
            {" "}and enter your Tenant ID and API key (from{" "}
            <a href="/admin/api-keys" className="text-[var(--accent)] hover:underline">API Keys</a>)
          </li>
          <li>
            Run{" "}
            <code className="font-mono text-xs bg-[var(--panel)] px-1.5 py-0.5 rounded text-[var(--text)]">eye-agent.exe --install</code>
            {" "}to add it to Windows startup
          </li>
          <li>
            The agent appears in your system tray and this page shows it as{" "}
            <span className="text-[var(--safe)] font-semibold">Online</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
