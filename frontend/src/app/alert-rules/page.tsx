"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import StatusBadge from "@/components/StatusBadge";
import { StatusTone } from "@/components/StatusBadge";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { listAlertRules, ApiError, AlertRule } from "@/lib/api-client";

const SEVERITY_TONE: Record<string, StatusTone> = {
  critical: "danger",
  high: "warn",
  info: "muted",
};

const CATEGORY_ICON: Record<string, string> = {
  authentication: "🔐",
  data_access: "📂",
  financial_transaction: "💳",
  any: "🔍",
};

function ThresholdDetail({ rule }: { rule: AlertRule }) {
  if (rule.window_minutes) {
    return (
      <div className="flex gap-6 text-sm">
        <div>
          <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Threshold</p>
          <p className="font-mono font-bold text-accent">{rule.threshold}+ events</p>
        </div>
        <div>
          <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Window</p>
          <p className="font-mono font-bold text-accent">{rule.window_minutes} min rolling</p>
        </div>
        <div>
          <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Filter</p>
          <p className="font-mono text-sm">{rule.category_filter}</p>
        </div>
      </div>
    );
  }
  if (rule.lookback_hours) {
    return (
      <div className="flex gap-6 text-sm">
        <div>
          <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Threshold</p>
          <p className="font-mono font-bold text-accent">Any match</p>
        </div>
        <div>
          <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Lookback</p>
          <p className="font-mono font-bold text-accent">{rule.lookback_hours}h</p>
        </div>
        <div>
          <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Filter</p>
          <p className="font-mono text-sm">{rule.category_filter}</p>
        </div>
      </div>
    );
  }
  return null;
}

export default function AlertRulesPage() {
  const ready = useRequireAuth();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    listAlertRules()
      .then(setRules)
      .catch((e: ApiError) => setError(e.message || "Failed to load rules"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  return (
    <NavBar>
      <main className="p-6 flex-1 max-w-3xl">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-semibold">Alert Rules</h1>
          <Link href="/alerts" className="text-xs text-accent hover:underline">
            View triggered alerts →
          </Link>
        </div>
        <p className="text-sm text-muted mb-6">
          Rules are evaluated on-demand against the live ledger every time the Alerts page is loaded — no background
          scheduler, no separate log. These thresholds are compiled into the backend; changing them requires a
          code deploy.
        </p>

        {loading && <p className="text-sm text-muted">Loading...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="space-y-4">
          {rules.map((rule) => {
            const tone = SEVERITY_TONE[rule.severity] ?? "muted";
            const icon = CATEGORY_ICON[rule.category_filter] ?? "⚙️";
            return (
              <Panel key={rule.rule_id} className="p-5" style={{ borderColor: `var(--${tone === "danger" ? "danger" : tone === "warn" ? "warn" : "border"})33` }}>
                <div className="flex items-start gap-4">
                  <span className="text-2xl shrink-0 mt-0.5">{icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-base">{rule.name}</span>
                      <StatusBadge tone={tone}>{rule.severity}</StatusBadge>
                    </div>
                    <p className="text-sm text-muted mb-4">{rule.description}</p>
                    <ThresholdDetail rule={rule} />
                    <p className="text-[10px] font-mono text-muted mt-4">rule_id: {rule.rule_id}</p>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>

        <div className="mt-8 rounded-xl border border-border bg-panel p-4 text-sm text-muted">
          <p className="font-semibold text-text mb-1">How evaluation works</p>
          <p>
            Alert keys are deterministic: <code className="text-xs bg-surface px-1 rounded">rule_id + tenant_id + actor_id + window_bucket</code>.
            Re-evaluating within the same window always produces the same key, so acknowledgments persist
            across page loads without spawning duplicate alerts per poll.
          </p>
        </div>
      </main>
    </NavBar>
  );
}
