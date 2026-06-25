"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import Button from "@/components/Button";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getChainSummary, verifyChain, ApiError, ChainSummary, ChainVerifyResult } from "@/lib/api-client";

function IntegrityStatus({ ok }: { ok: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-8 text-center ${
        ok ? "border-safe/40 bg-safe/5" : "border-danger/40 bg-danger/5"
      }`}
    >
      <div className={`text-5xl mb-3 ${ok ? "text-safe" : "text-danger"}`}>{ok ? "✓" : "✗"}</div>
      <p className={`text-2xl font-extrabold tracking-wide ${ok ? "text-safe" : "text-danger"}`}>
        {ok ? "CHAIN INTACT" : "TAMPERING DETECTED"}
      </p>
      <p className="text-sm text-muted mt-2">
        {ok
          ? "All records verified — no divergences found."
          : "One or more records do not match their expected hash."}
      </p>
    </div>
  );
}

export default function ChainPage() {
  const ready = useRequireAuth();
  const [summary, setSummary] = useState<ChainSummary | null>(null);
  const [verifyResult, setVerifyResult] = useState<ChainVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    getChainSummary().catch(() => {});
    getChainSummary()
      .then(setSummary)
      .catch((e: ApiError) => setError(e.message || "Failed to load chain summary"));
  }, [ready]);

  async function handleVerify() {
    setVerifying(true);
    setError(null);
    setVerifyResult(null);
    try {
      setVerifyResult(await verifyChain());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="p-6 flex-1 max-w-3xl space-y-6">
        <div>
          <h1 className="text-lg font-semibold mb-1">Chain of Custody</h1>
          <p className="text-sm text-muted">
            Each ledger record is SHA-256 hashed with the previous record's hash as input, forming a tamper-evident
            chain. Verification re-derives every hash from scratch and compares it against the stored value.
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {/* Chain summary */}
        {summary && (
          <Panel className="p-5">
            <p className="text-xs font-bold tracking-wide text-muted uppercase mb-4">Chain metadata</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Total records</p>
                <p className="text-xl font-extrabold font-mono text-accent">{summary.total_events.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Sequence range</p>
                <p className="font-mono text-base">
                  {summary.first_sequence_num ?? "—"} → {summary.last_sequence_num ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wide mb-0.5">First event</p>
                <p className="text-sm">{summary.first_event_at ? new Date(summary.first_event_at).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Last event</p>
                <p className="text-sm">{summary.last_event_at ? new Date(summary.last_event_at).toLocaleString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Genesis hash</p>
                <p className="font-mono text-xs text-muted">{"0".repeat(64)}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Algorithm</p>
                <p className="font-mono text-sm">SHA-256</p>
              </div>
            </div>
          </Panel>
        )}

        {/* Verification */}
        <Panel className="p-5">
          <p className="text-xs font-bold tracking-wide text-muted uppercase mb-2">On-demand verification</p>
          <p className="text-sm text-muted mb-4">
            Walks every record in sequence order and recomputes the hash chain from scratch. For large ledgers this
            may take a few seconds.
          </p>
          <Button onClick={handleVerify} disabled={verifying}>
            {verifying ? "Verifying…" : "Verify chain now"}
          </Button>

          {verifyResult && (
            <div className="mt-5">
              <IntegrityStatus ok={verifyResult.ok} />
              <p className="text-xs text-muted text-center mt-2">{verifyResult.records_checked} records checked</p>
              {!verifyResult.ok && verifyResult.divergences.length > 0 && (
                <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4 space-y-1">
                  <p className="text-xs font-bold text-danger uppercase tracking-wide mb-2">Divergences</p>
                  {verifyResult.divergences.map((d, i) => (
                    <p key={i} className="text-xs font-mono text-muted">
                      seq={d.sequence_num} field={d.field} expected=
                      <span className="text-safe">{d.expected.slice(0, 12)}…</span> actual=
                      <span className="text-danger">{d.actual.slice(0, 12)}…</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* What's guaranteed */}
        <Panel className="p-5 space-y-4 text-sm">
          <p className="text-xs font-bold tracking-wide text-muted uppercase">What this guarantees</p>
          <div className="space-y-2">
            {[
              ["✓", "safe", "Application layer cannot modify or delete records", "The app DB role only has INSERT + SELECT on ledger.events."],
              ["✓", "safe", "Insider threats detected", "Triggers reject any UPDATE/DELETE regardless of grants."],
              ["✓", "safe", "Tamper-evidence via hash chain", "Any out-of-band edit breaks the chain and is detected by this page."],
              ["✗", "warn", "Does not stop a rogue Postgres superuser", "A superuser can disable triggers and edit rows directly — they're detected after the fact, not prevented."],
              ["◷", "muted", "External notarization (Phase 2)", "RFC 3161/OpenTimestamps integration will anchor the chain to an independent third party. Schema is ready."],
            ].map(([icon, tone, title, detail]) => (
              <div key={title} className="flex gap-3">
                <span className={`font-bold text-${tone} shrink-0 w-4 text-center`}>{icon}</span>
                <div>
                  <p className={`font-semibold text-${tone}`}>{title}</p>
                  <p className="text-muted text-xs mt-0.5">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </main>
    </div>
  );
}
