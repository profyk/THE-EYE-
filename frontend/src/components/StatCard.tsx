"use client";

import Panel from "@/components/Panel";

export type StatTone = "accent" | "danger" | "warn" | "safe" | "iris" | "muted";

interface Props {
  label: string;
  value: number | string;
  tone?: StatTone;
}

const TEXT: Record<StatTone, string> = {
  accent: "text-accent",
  danger: "text-danger",
  warn: "text-warn",
  safe: "text-safe",
  iris: "text-iris",
  muted: "text-muted",
};

export default function StatCard({ label, value, tone = "accent" }: Props) {
  return (
    <Panel className="p-5">
      <p className="text-xs text-muted uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-3xl font-extrabold mt-1.5 font-mono ${TEXT[tone]}`}>{value}</p>
    </Panel>
  );
}
