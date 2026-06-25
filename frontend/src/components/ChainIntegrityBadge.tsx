"use client";

// Phase 1 keeps this informational only -- there's no live chain-status API
// endpoint yet (that's a Phase 2+ addition). Integrity is verified out-of-band
// via `python -m scripts.verify_chain`; this badge just reminds operators that
// the check exists rather than claiming a live status it can't actually back.

export default function ChainIntegrityBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border text-muted bg-surface"
      title="Run `python -m scripts.verify_chain` on the backend to independently verify the hash chain"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-muted" />
      Chain integrity: verify via CLI
    </span>
  );
}
