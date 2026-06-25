"use client";

import { FormEvent, useState } from "react";
import NavBar from "@/components/NavBar";
import EventTable from "@/components/EventTable";
import Button from "@/components/Button";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { investigate, ApiError, InvestigateResponse } from "@/lib/api-client";

export default function InvestigatePage() {
  const ready = useRequireAuth();
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<InvestigateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await investigate(question));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to investigate");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="p-6 flex-1 max-w-3xl">
        <h1 className="text-lg font-semibold mb-1 no-print">AI Investigate</h1>
        <p className="text-sm text-muted mb-4 no-print">
          Ask a question in plain language. The AI translates it into a real search against the immutable ledger and
          writes a report from the actual matching records -- it never sees anything outside this app&apos;s audit data.
        </p>

        <form onSubmit={handleSubmit} className="flex gap-2 mb-6 no-print">
          <input
            className="flex-1 border border-border bg-surface text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            placeholder="e.g. show all failed logins by bob in the last 7 days"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button type="submit" disabled={loading || !question}>
            {loading ? "Investigating..." : "Ask"}
          </Button>
        </form>

        {error && <p className="text-sm text-danger no-print">{error}</p>}

        {result && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Report</h2>
              <Button variant="outline" tone="muted" onClick={() => window.print()} className="no-print text-xs px-2 py-1">
                Print / Save as PDF
              </Button>
            </div>
            <p className="text-xs text-muted mb-2">
              Question: &ldquo;{question}&rdquo; &middot; {result.matched_count} matching events
            </p>
            <div className="rounded-xl border border-border bg-panel p-4 whitespace-pre-wrap text-sm mb-6">
              {result.report_text}
            </div>
            <h2 className="text-sm font-semibold mb-2">Matching events</h2>
            <EventTable events={result.events} />
          </div>
        )}
      </main>
    </div>
  );
}
