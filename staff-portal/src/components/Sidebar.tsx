"use client";
import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";
import { logout } from "@/lib/api-client";

interface NavItem { label: string; href: string; icon: React.ReactElement; }
interface NavGroup { title: string; items: NavItem[]; }

function IconDashboard(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  );
}
function IconBuilding(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="1"/><path d="M8 21V9h8v12"/>
      <path d="M9 9h1m5 0h1M9 14h1m5 0h1M9 17h1m5 0h1"/>
    </svg>
  );
}
function IconUsers(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconActivity(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}

const GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: <IconDashboard /> },
    ],
  },
  {
    title: "Clients",
    items: [
      { label: "Tenants", href: "/tenants", icon: <IconBuilding /> },
      { label: "All Users", href: "/users", icon: <IconUsers /> },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Health", href: "/health", icon: <IconActivity /> },
    ],
  },
];

export default function Sidebar(): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const session = getSession();

  async function handleSignOut() {
    try { await logout(); } catch { /* ignore */ }
    clearSession();
    router.replace("/login");
  }

  return (
    <aside className="w-[220px] min-h-screen bg-deep border-r border-border flex flex-col sticky top-0 shrink-0">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-border">
        <p className="text-[10px] tracking-[3px] text-accent font-bold uppercase">THE EYE</p>
        <p className="text-[9px] tracking-[2px] text-muted uppercase mt-0.5">Command Centre</p>
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
                      active
                        ? "bg-accent/10 text-accent font-semibold"
                        : "text-muted hover:text-text hover:bg-surface"
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

      {/* User footer */}
      <div className="px-4 py-4 border-t border-border">
        <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Signed in as</p>
        <p className="text-sm font-semibold text-text truncate">{session?.username ?? "—"}</p>
        <p className="text-[10px] text-accent uppercase tracking-wider mb-3">Super Admin</p>
        <button
          onClick={handleSignOut}
          className="w-full text-xs text-muted hover:text-danger transition-colors py-1.5 px-2 rounded-lg hover:bg-danger/10 text-left"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
