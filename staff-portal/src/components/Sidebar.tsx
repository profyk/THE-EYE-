"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";
import { logout } from "@/lib/api-client";
import ThemeToggle from "@/components/ThemeToggle";

interface NavItem { label: string; href: string; icon: React.ReactElement; }
interface NavGroup { title: string; items: NavItem[]; }

function I(paths: string[]): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

const ICONS = {
  dashboard:     I(["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"]),
  tenants:       I(["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z", "M9 22V12h6v10"]),
  users:         I(["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"]),
  billing:       I(["M12 2v20M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"]),
  subscriptions: I(["M20 12V22H4V12", "M22 7H2v5h20V7z", "M12 22V7", "M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z", "M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"]),
  plans:         I(["M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2z", "M7 7h.01"]),
  analytics:     I(["M18 20V10M12 20V4M6 20v-6"]),
  health:        I(["M22 12h-4l-3 9L9 3l-3 9H2"]),
  settings:      I(["M12 15a3 3 0 100-6 3 3 0 000 6z", "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"]),
};

const GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: ICONS.dashboard }],
  },
  {
    title: "Clients",
    items: [
      { label: "Tenants",   href: "/tenants", icon: ICONS.tenants },
      { label: "All Users", href: "/users",   icon: ICONS.users },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Billing",       href: "/billing",       icon: ICONS.billing },
      { label: "Subscriptions", href: "/subscriptions", icon: ICONS.subscriptions },
      { label: "Plans",         href: "/plans",         icon: ICONS.plans },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Analytics", href: "/analytics", icon: ICONS.analytics },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Health",   href: "/health",   icon: ICONS.health },
      { label: "Settings", href: "/settings", icon: ICONS.settings },
    ],
  },
];

export default function Sidebar(): React.ReactElement {
  const pathname = usePathname();
  const session = getSession();

  async function handleSignOut() {
    try { await logout(); } catch { /* ignore — session expires server-side */ }
    clearSession();
    window.location.replace("/login");
  }

  return (
    <aside className="w-[220px] min-h-screen bg-deep border-r border-border flex flex-col sticky top-0 shrink-0 h-screen overflow-y-auto">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-border shrink-0">
        <p className="text-[10px] tracking-[3px] text-accent font-bold uppercase">THE EYE</p>
        <p className="text-[9px] tracking-[2px] text-muted uppercase mt-0.5">Command Centre</p>
        <button
          onClick={() => {
            const e = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
            window.dispatchEvent(e);
          }}
          className="mt-3 w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-muted text-[10px] hover:border-accent/40 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span className="flex-1 text-left">Search…</span>
          <kbd className="font-mono bg-void border border-border rounded px-1 text-[9px]">⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="px-2 mb-1.5 text-[9px] tracking-[2px] text-muted uppercase font-bold">{g.title}</p>
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      active ? "bg-accent/10 text-accent font-semibold" : "text-muted hover:text-text hover:bg-surface"
                    }`}
                  >
                    <span className={active ? "text-accent" : "text-muted"}>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-text truncate">{session?.username ?? "—"}</p>
            <p className="text-[10px] text-accent uppercase tracking-wider">Super Admin</p>
          </div>
          <ThemeToggle />
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 text-xs text-muted hover:text-danger transition-colors py-1.5 px-2 rounded-lg hover:bg-danger/10 text-left"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}
