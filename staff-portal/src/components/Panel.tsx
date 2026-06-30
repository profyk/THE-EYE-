import React from "react";
interface Props { children: React.ReactNode; className?: string; }
export default function Panel({ children, className = "" }: Props) {
  return (
    <div className={`bg-panel border border-border rounded-xl ${className}`}>
      {children}
    </div>
  );
}
