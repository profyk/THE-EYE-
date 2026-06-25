"use client";

import { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonTone = "accent" | "danger" | "warn" | "safe" | "iris" | "muted";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  tone?: ButtonTone;
}

const SOLID: Record<ButtonTone, string> = {
  accent: "bg-accent hover:bg-accent-dim",
  danger: "bg-danger hover:opacity-90",
  warn: "bg-warn hover:opacity-90",
  safe: "bg-safe hover:opacity-90",
  iris: "bg-iris hover:opacity-90",
  muted: "bg-muted hover:opacity-90",
};

const OUTLINE: Record<ButtonTone, string> = {
  accent: "border-accent text-accent hover:bg-accent/10",
  danger: "border-danger text-danger hover:bg-danger/10",
  warn: "border-warn text-warn hover:bg-warn/10",
  safe: "border-safe text-safe hover:bg-safe/10",
  iris: "border-iris text-iris hover:bg-iris/10",
  muted: "border-border text-muted hover:bg-surface",
};

const GHOST: Record<ButtonTone, string> = {
  accent: "text-accent hover:bg-accent/10",
  danger: "text-danger hover:bg-danger/10",
  warn: "text-warn hover:bg-warn/10",
  safe: "text-safe hover:bg-safe/10",
  iris: "text-iris hover:bg-iris/10",
  muted: "text-muted hover:bg-surface",
};

export default function Button({ variant = "primary", tone = "accent", className = "", ...props }: Props) {
  const base =
    "text-sm font-semibold rounded-lg px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
  const variantClass =
    variant === "primary" ? `${SOLID[tone]} text-white` : variant === "outline" ? `border ${OUTLINE[tone]}` : GHOST[tone];

  return <button className={`${base} ${variantClass} ${className}`} {...props} />;
}
