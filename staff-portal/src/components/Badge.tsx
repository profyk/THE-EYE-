interface Props {
  variant: "active" | "suspended" | "trial" | "paid" | "inactive" | "warn" | "neutral";
  children: React.ReactNode;
}
const STYLES: Record<Props["variant"], string> = {
  active:    "bg-safe/10 text-safe border-safe/30",
  suspended: "bg-danger/10 text-danger border-danger/30",
  trial:     "bg-accent/10 text-accent border-accent/30",
  paid:      "bg-safe/10 text-safe border-safe/30",
  inactive:  "bg-muted/10 text-muted border-muted/30",
  warn:      "bg-warn/10 text-warn border-warn/30",
  neutral:   "bg-surface text-muted border-border",
};
export default function Badge({ variant, children }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${STYLES[variant]}`}>
      {children}
    </span>
  );
}
