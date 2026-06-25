export type ProgressTone = "accent" | "danger" | "warn" | "safe" | "iris" | "muted";

interface Props {
  value: number;
  max?: number;
  tone?: ProgressTone;
  className?: string;
}

const TONE_BG: Record<ProgressTone, string> = {
  accent: "bg-accent",
  danger: "bg-danger",
  warn: "bg-warn",
  safe: "bg-safe",
  iris: "bg-iris",
  muted: "bg-muted",
};

export default function ProgressBar({ value, max = 100, tone = "accent", className = "" }: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`h-1.5 w-full rounded-full bg-surface overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${TONE_BG[tone]} transition-[width]`} style={{ width: `${pct}%` }} />
    </div>
  );
}
