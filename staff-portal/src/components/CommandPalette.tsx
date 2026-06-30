"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const COMMANDS = [
  { label: "Dashboard",       href: "/dashboard",     category: "Navigate" },
  { label: "Tenants",         href: "/tenants",        category: "Navigate" },
  { label: "All Users",       href: "/users",          category: "Navigate" },
  { label: "Billing",         href: "/billing",        category: "Navigate" },
  { label: "Subscriptions",   href: "/subscriptions",  category: "Navigate" },
  { label: "Analytics",       href: "/analytics",      category: "Navigate" },
  { label: "Platform Health", href: "/health",         category: "Navigate" },
  { label: "Settings",        href: "/settings",       category: "Navigate" },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((v) => !v);
      setQuery("");
    }
    if (e.key === "Escape") setOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const filtered = COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg mx-4 bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted shrink-0">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            autoFocus
            type="text"
            placeholder="Search commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent py-4 text-sm text-text placeholder:text-muted outline-none"
          />
          <kbd className="text-[10px] text-muted bg-surface border border-border rounded px-1.5 py-0.5 font-mono">ESC</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted">No results</p>
          )}
          {filtered.map((cmd) => (
            <button
              key={cmd.href}
              onClick={() => go(cmd.href)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface text-left transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted shrink-0">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span className="text-sm text-text">{cmd.label}</span>
              <span className="ml-auto text-[10px] text-muted">{cmd.category}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-muted">
          <span><kbd className="font-mono bg-surface border border-border rounded px-1">↵</kbd> select</span>
          <span><kbd className="font-mono bg-surface border border-border rounded px-1">ESC</kbd> close</span>
          <span className="ml-auto"><kbd className="font-mono bg-surface border border-border rounded px-1">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
