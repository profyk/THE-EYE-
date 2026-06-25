"use client";

import { FormEvent, useState } from "react";
import { submitWhistleblowerReport, ApiError } from "@/lib/api-client";
import Button from "@/components/Button";

const CATEGORIES = ["corruption", "fraud", "safety", "abuse_of_power", "other"];

const INPUT_CLASS =
  "border border-border bg-surface text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

// Deliberately outside the authenticated app shell: no NavBar, no login
// required, nothing here ever reads or writes localStorage session state.
export default function ReportPage() {
  const [report, setReport] = useState("");
  const [category, setCategory] = useState("other");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await submitWhistleblowerReport(report, category);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? "Failed to submit -- please try again later." : "Failed to submit.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-void">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2 text-text">Report submitted</h1>
          <p className="text-sm text-muted">
            Thank you. Your report has been recorded anonymously -- no IP address, location, or any other
            identifying information was captured.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-void">
      <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-4 p-6 rounded-xl border border-border bg-panel">
        <h1 className="text-xl font-semibold text-text">Submit an anonymous report</h1>
        <p className="text-sm text-muted">
          This form is completely anonymous. We do not record your IP address, location, browser, or any other
          identifying information -- only the text you submit below.
        </p>
        <label className="flex flex-col text-sm gap-1 text-muted">
          Category
          <select className={INPUT_CLASS} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm gap-1 text-muted">
          What happened?
          <textarea
            className={`${INPUT_CLASS} h-40`}
            value={report}
            onChange={(e) => setReport(e.target.value)}
            maxLength={4000}
            required
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={loading || !report} className="w-full">
          {loading ? "Submitting..." : "Submit anonymously"}
        </Button>
      </form>
    </div>
  );
}
