import { ReactNode } from "react";

export type StatusTone = "accent" | "danger" | "warn" | "safe" | "iris" | "muted";

interface Props {
  tone: StatusTone;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}

const TONE: Record<StatusTone, { dot: string; text: string; bg: string }> = {
  accent: { dot: "bg-accent", text: "text-accent", bg: "bg-accent/10" },
  danger: { dot: "bg-danger", text: "text-danger", bg: "bg-danger/10" },
  warn: { dot: "bg-warn", text: "text-warn", bg: "bg-warn/10" },
  safe: { dot: "bg-safe", text: "text-safe", bg: "bg-safe/10" },
  iris: { dot: "bg-iris", text: "text-iris", bg: "bg-iris/10" },
  muted: { dot: "bg-muted", text: "text-muted", bg: "bg-muted/10" },
};

export default function StatusBadge({ tone, children, pulse = false, className = "" }: Props) {
  const c = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${c.bg} ${c.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot} ${pulse ? "animate-pulse-glow" : ""}`} />
      {children}
    </span>
  );
}
