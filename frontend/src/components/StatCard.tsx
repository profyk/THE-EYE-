"use client";

export type StatTone = "accent" | "danger" | "warn" | "safe" | "iris" | "muted";

interface Props {
  label: string;
  value: number | string;
  tone?: StatTone;
  sub?: string;
}

const TEXT: Record<StatTone, string> = {
  accent: "text-accent",
  danger: "text-danger",
  warn:   "text-warn",
  safe:   "text-safe",
  iris:   "text-iris",
  muted:  "text-muted",
};

const BORDER_L: Record<StatTone, string> = {
  accent: "border-l-accent",
  danger: "border-l-danger",
  warn:   "border-l-warn",
  safe:   "border-l-safe",
  iris:   "border-l-iris",
  muted:  "border-l-muted",
};

export default function StatCard({ label, value, tone = "accent", sub }: Props) {
  return (
    <div className={`rounded-xl border border-border border-l-4 ${BORDER_L[tone]} bg-panel px-5 py-4`}>
      <p className="text-[10px] text-muted uppercase tracking-[0.14em] font-bold">{label}</p>
      <p className={`text-4xl font-extrabold mt-2 font-mono leading-none ${TEXT[tone]}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted mt-2">{sub}</p>}
    </div>
  );
}
