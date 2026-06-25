"use client";

import { EventSearchParams } from "@/types/event";

const CATEGORIES = [
  "authentication",
  "authorization",
  "data_access",
  "data_modification",
  "configuration",
  "process_execution",
  "network",
  "financial_transaction",
  "administrative",
  "system",
];

const OUTCOMES = ["success", "failure", "denied", "unknown"];

const INPUT_CLASS =
  "border border-border bg-surface text-text rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
const LABEL_CLASS = "flex flex-col gap-1 text-xs uppercase tracking-wide text-muted font-semibold";

interface Props {
  value: EventSearchParams;
  onChange: (value: EventSearchParams) => void;
}

export default function EventFilters({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <label className={LABEL_CLASS}>
        Actor ID
        <input
          className={INPUT_CLASS}
          value={value.actor_id ?? ""}
          onChange={(e) => onChange({ ...value, actor_id: e.target.value })}
          placeholder="e.g. alice"
        />
      </label>

      <label className={LABEL_CLASS}>
        Event type
        <input
          className={INPUT_CLASS}
          value={value.event_type ?? ""}
          onChange={(e) => onChange({ ...value, event_type: e.target.value })}
          placeholder="e.g. auth.login"
        />
      </label>

      <label className={LABEL_CLASS}>
        Category
        <select
          className={INPUT_CLASS}
          value={value.event_category ?? ""}
          onChange={(e) => onChange({ ...value, event_category: e.target.value })}
        >
          <option value="">Any</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className={LABEL_CLASS}>
        Outcome
        <select
          className={INPUT_CLASS}
          value={value.outcome ?? ""}
          onChange={(e) => onChange({ ...value, outcome: e.target.value })}
        >
          <option value="">Any</option>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
