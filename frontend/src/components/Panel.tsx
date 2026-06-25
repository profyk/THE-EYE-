import { HTMLAttributes } from "react";

export default function Panel({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-xl border border-border bg-panel ${className}`} {...props} />;
}
