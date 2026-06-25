import { ReactNode } from "react";

export default function EmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm text-muted py-6 text-center ${className}`}>{children}</p>;
}
