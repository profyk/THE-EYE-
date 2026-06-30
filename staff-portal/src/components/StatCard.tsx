interface Props {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "accent" | "safe" | "danger" | "warn" | "muted";
}
const TEXT = { accent: "text-accent", safe: "text-safe", danger: "text-danger", warn: "text-warn", muted: "text-muted" };
const BORDER = { accent: "border-l-accent", safe: "border-l-safe", danger: "border-l-danger", warn: "border-l-warn", muted: "border-l-muted" };

export default function StatCard({ label, value, sub, tone = "accent" }: Props) {
  return (
    <div className={`bg-panel rounded-xl border border-border border-l-4 ${BORDER[tone]} px-5 py-4`}>
      <p className="text-[10px] text-muted uppercase tracking-[0.14em] font-bold">{label}</p>
      <p className={`text-4xl font-extrabold mt-2 font-mono leading-none ${TEXT[tone]}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-2">{sub}</p>}
    </div>
  );
}
