"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getSession } from "@/lib/auth";
import { logout } from "@/lib/api-client";
import ThemeToggle from "@/components/ThemeToggle";

// ── Inline SVG icons (16×16 stroke style) ────────────────────────────────────
function Icon({ d, d2 }: { d: string; d2?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0">
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  );
}

const ICONS: Record<string, React.ReactElement> = {
  overview:  <Icon d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  events:    <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  timeline:  <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
  analytics: <Icon d="M18 20V10M12 20V4M6 20v-6" />,
  activity:  <Icon d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  users:     <Icon d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" d2="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />,
  alerts:    <Icon d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />,
  alertrules:<Icon d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  forensics: <Icon d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" />,
  chain:     <Icon d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" d2="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />,
  investigate:<Icon d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3M6.343 6.343l-.707-.707M12 21v-1M4.22 19.78l.707-.707M17.657 6.343l.707-.707M19.78 19.78l-.707-.707" d2="M12 14a2 2 0 100-4 2 2 0 000 4z" />,
  accesslog: <Icon d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />,
  apikeys:   <Icon d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />,
  billing:   <Icon d="M1 4h22v16a2 2 0 01-2 2H3a2 2 0 01-2-2V4zM1 10h22" />,
  machines:  <Icon d="M2 3h20v14H2zM8 21h8M12 17v4" />,
  intrusion: <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  sources:   <Icon d="M5 12H3m4.22-4.22L5.8 6.35M12 5V3m4.22 2.78l1.42-1.42M19 12h2m-4.22 4.22l1.42 1.42M12 19v2m-4.22-2.78l-1.42 1.42M6 12a6 6 0 1112 0 6 6 0 01-12 0z" />,
  manageusers:<Icon d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" d2="M12 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6" />,
  deletion:  <Icon d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2" />,
  reports:   <Icon d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />,
  settings:  <Icon d="M12 15a3 3 0 100-6 3 3 0 000 6z" d2="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />,
};

const MONITOR_ITEMS = [
  { href: "/overview",            label: "Overview",        icon: ICONS.overview     },
  { href: "/events",              label: "Events",          icon: ICONS.events       },
  { href: "/timeline",            label: "Timeline",        icon: ICONS.timeline     },
  { href: "/analytics",           label: "Analytics",       icon: ICONS.analytics    },
  { href: "/activity",            label: "Activity",        icon: ICONS.activity     },
];

const SECURITY_ITEMS = [
  { href: "/alerts",              label: "Alerts",          icon: ICONS.alerts       },
  { href: "/alert-rules",         label: "Alert Rules",     icon: ICONS.alertrules   },
  { href: "/intrusion-detection", label: "Intrusion",       icon: ICONS.intrusion    },
  { href: "/users-risk",          label: "Users & Risk",    icon: ICONS.users        },
];

const AUDIT_ITEMS = [
  { href: "/forensics",           label: "Forensics",       icon: ICONS.forensics    },
  { href: "/chain",               label: "Chain",           icon: ICONS.chain        },
  { href: "/investigate",         label: "Investigate",     icon: ICONS.investigate  },
  { href: "/access-log",          label: "Access Log",      icon: ICONS.accesslog    },
];

const APPROVER_ROLES = ["admin", "chief_auditor", "compliance_officer", "security_officer", "executive_authority"];
const REPORT_READER_ROLES = ["admin", "investigator"];

function NavGroup({ label, items }: { label: string; items: { href: string; label: string; icon: React.ReactElement }[] }) {
  const pathname = usePathname();
  return (
    <div>
      <p className="px-3 pt-4 pb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-muted select-none">
        {label}
      </p>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2 mx-1 rounded-lg text-sm transition-colors ${
              active
                ? "bg-accent/10 text-accent font-semibold"
                : "text-muted hover:text-text hover:bg-surface"
            }`}
          >
            <span className={active ? "text-accent" : ""}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function Sidebar() {
  const router   = useRouter();
  const session  = getSession();

  const canSeeDeletion   = session?.role && APPROVER_ROLES.includes(session.role);
  const canSeeReports    = session?.role && REPORT_READER_ROLES.includes(session.role);
  const isAdmin          = session?.role === "admin";

  const adminItems = [
    ...(isAdmin          ? [{ href: "/admin/sources",           label: "Sources",           icon: ICONS.sources     }] : []),
    ...(isAdmin          ? [{ href: "/admin/users",             label: "Manage Users",      icon: ICONS.manageusers }] : []),
    ...(isAdmin          ? [{ href: "/admin/api-keys",          label: "API Keys",          icon: ICONS.apikeys     }] : []),
    ...(isAdmin          ? [{ href: "/admin/machines",          label: "Machines",          icon: ICONS.machines    }] : []),
    ...(isAdmin          ? [{ href: "/billing",                 label: "Billing",           icon: ICONS.billing     }] : []),
    ...(canSeeDeletion   ? [{ href: "/admin/deletion-requests", label: "Deletion Requests", icon: ICONS.deletion    }] : []),
    ...(canSeeReports    ? [{ href: "/admin/whistleblower",     label: "Reports",           icon: ICONS.reports     }] : []),
    ...(isAdmin          ? [{ href: "/settings",                label: "Settings",          icon: ICONS.settings    }] : []),
  ];

  async function handleLogout() {
    try { await logout(); } finally {
      clearSession();
      router.replace("/login");
    }
  }

  return (
    <aside className="w-[220px] shrink-0 flex flex-col bg-deep border-r border-border min-h-screen sticky top-0 h-screen overflow-y-auto">

      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border shrink-0">
        <div className="bg-white rounded-lg p-0.5 shrink-0">
          <Image src="/logo.png" alt="THE EYE" width={30} height={30} className="rounded-md" priority />
        </div>
        <div>
          <p className="font-mono font-extrabold text-[13px] tracking-[2.5px] text-accent leading-none">THE EYE</p>
          <p className="text-[8px] tracking-[1.5px] text-muted uppercase leading-none mt-0.5">Accountability Platform</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2">
        <NavGroup label="Monitor" items={MONITOR_ITEMS} />
        <NavGroup label="Security" items={SECURITY_ITEMS} />
        <NavGroup label="Audit" items={AUDIT_ITEMS} />
        {adminItems.length > 0 && <NavGroup label="Admin" items={adminItems} />}
      </nav>

      {/* Footer: user + actions */}
      <div className="border-t border-border px-3 py-3 shrink-0 space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{session?.username ?? "—"}</p>
            <p className="text-[10px] text-muted capitalize">{session?.role?.replace(/_/g, " ")}</p>
          </div>
          <ThemeToggle />
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-muted hover:text-danger hover:bg-danger/10 transition-colors"
        >
          <Icon d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
