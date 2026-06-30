"use client";

import { useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import EventTable from "@/components/EventTable";
import NetworkGraph from "@/components/NetworkGraph";
import Panel from "@/components/Panel";
import Button from "@/components/Button";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  searchEvents,
  downloadEventsExport,
  verifyChain,
  getForensicsNetwork,
  ApiError,
  ChainVerifyResult,
  NetworkGraph as NetworkGraphData,
} from "@/lib/api-client";
import { EventRead } from "@/types/event";

type ActionTone = "accent" | "iris" | "safe" | "warn" | "danger";

const TONE_CLASSES: Record<ActionTone, string> = {
  accent: "bg-accent/10 border-accent/30 text-accent hover:bg-accent/15",
  iris: "bg-iris/10 border-iris/30 text-iris hover:bg-iris/15",
  safe: "bg-safe/10 border-safe/30 text-safe hover:bg-safe/15",
  warn: "bg-warn/10 border-warn/30 text-warn hover:bg-warn/15",
  danger: "bg-danger/10 border-danger/30 text-danger hover:bg-danger/15",
};

function ActionCard({
  icon,
  label,
  tone,
  onClick,
  disabled,
  href,
}: {
  icon: string;
  label: string;
  tone: ActionTone;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
}) {
  const className = `text-left rounded-xl border p-4 transition-colors disabled:opacity-50 cursor-pointer ${TONE_CLASSES[tone]}`;
  const content = (
    <>
      <div className="text-xl mb-2">{icon}</div>
      <div className="text-xs font-semibold leading-snug">{label}</div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={className}>
      {content}
    </button>
  );
}

export default function ForensicsPage() {
  const ready = useRequireAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EventRead[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [verifyResult, setVerifyResult] = useState<ChainVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [network, setNetwork] = useState<NetworkGraphData | null>(null);
  const [loadingNetwork, setLoadingNetwork] = useState(false);

  async function handleSearch() {
    setSearching(true);
    setError(null);
    try {
      setResults(await searchEvents({ q: query, limit: 100 }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleExport(format: "csv" | "json") {
    try {
      await downloadEventsExport({ q: query, limit: 500 }, format);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    }
  }

  async function handleVerify() {
    setVerifying(true);
    setError(null);
    try {
      setVerifyResult(await verifyChain());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Chain verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function handleLoadNetwork() {
    setLoadingNetwork(true);
    setError(null);
    try {
      setNetwork(await getForensicsNetwork());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load network");
    } finally {
      setLoadingNetwork(false);
    }
  }

  if (!ready) return null;

  return (
    <NavBar>
      <main className="p-6 flex-1 max-w-4xl">
        <h1 className="text-lg font-semibold mb-1 no-print">Forensics</h1>
        <p className="text-sm text-muted mb-6 no-print">
          Search across all data, export evidence, verify chain-of-custody, and map actor-target relationships.
        </p>

        {error && <p className="text-sm text-danger mb-4 no-print">{error}</p>}

        <Panel className="p-5 mb-8 no-print">
          <p className="text-sm font-bold tracking-wide mb-4">FORENSIC INVESTIGATION MODULE</p>
          <div className="flex gap-2 mb-5">
            <input
              className="flex-1 border border-border bg-surface text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="actor, event type, or target ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button onClick={handleSearch} disabled={searching}>
              {searching ? "Searching..." : "Search"}
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <ActionCard icon="📦" label="Export Evidence (CSV)" tone="accent" onClick={() => handleExport("csv")} />
            <ActionCard icon="📋" label="Export Evidence (JSON)" tone="iris" onClick={() => handleExport("json")} />
            <ActionCard
              icon="⛓️"
              label={verifying ? "Verifying chain..." : "Verify Chain of Custody"}
              tone="safe"
              onClick={handleVerify}
              disabled={verifying}
            />
            <ActionCard
              icon="🔗"
              label={loadingNetwork ? "Loading network..." : "Map Relationship Network"}
              tone="accent"
              onClick={handleLoadNetwork}
              disabled={loadingNetwork}
            />
            <ActionCard icon="🗺️" label="Build Activity Timeline" tone="warn" href="/timeline" />
            <ActionCard icon="🧠" label="AI Investigate Report" tone="danger" href="/investigate" />
          </div>
        </Panel>

        {results.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold mb-2">Search results</h2>
            <EventTable events={results} />
          </section>
        )}

        {verifyResult && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold mb-2">Chain-of-custody verification</h2>
            <div
              className={`rounded-xl border p-4 text-sm ${
                verifyResult.ok ? "border-safe bg-safe/10" : "border-danger bg-danger/10"
              }`}
            >
              <p className="font-medium">
                {verifyResult.ok
                  ? `Chain intact -- ${verifyResult.records_checked} records verified.`
                  : `TAMPER DETECTED after checking ${verifyResult.records_checked} records.`}
              </p>
              {!verifyResult.ok &&
                verifyResult.divergences.map((d, i) => (
                  <p key={i} className="font-mono text-xs mt-1 text-muted">
                    sequence_num={d.sequence_num} field={d.field} expected={d.expected} actual={d.actual}
                  </p>
                ))}
            </div>
          </section>
        )}

        {network && (
          <section className="no-print">
            <h2 className="text-sm font-semibold mb-2">Relationship network</h2>
            <NetworkGraph graph={network} />
          </section>
        )}
      </main>
    </NavBar>
  );
}
