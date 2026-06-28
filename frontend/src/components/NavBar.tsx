"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getSession } from "@/lib/auth";
import { listAlerts, logout } from "@/lib/api-client";
import ChainIntegrityBadge from "@/components/ChainIntegrityBadge";
import ThemeToggle from "@/components/ThemeToggle";

const APPROVER_ROLES = ["chief_auditor", "compliance_officer", "security_officer", "executive_authority"];
const REPORT_READER_ROLES = ["admin", "investigator"];

const NAV_ITEMS = [
  { href: "/overview", label: "Overview" },
  { href: "/analytics", label: "Analytics" },
  { href: "/events", label: "Events" },
  { href: "/timeline", label: "Timeline" },
  { href: "/activity", label: "Activity" },
  { href: "/users-risk", label: "Users" },
  { href: "/alerts", label: "Alerts" },
  { href: "/alert-rules", label: "Alert Rules" },
  { href: "/forensics", label: "Forensics" },
  { href: "/chain", label: "Chain" },
  { href: "/investigate", label: "Investigate" },
  { href: "/access-log", label: "Access Log" },
  { href: "/intrusion-detection", label: "Intrusion" },
];

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const session = getSession();
  const canSeeDeletionRequests = session?.role === "admin" || APPROVER_ROLES.includes(session?.role ?? "");
  const canSeeWhistleblowerReports = session?.role && REPORT_READER_ROLES.includes(session.role);
  const [criticalCount, setCriticalCount] = useState<number | null>(null);

  useEffect(() => {
    listAlerts()
      .then((alerts) => setCriticalCount(alerts.filter((a) => a.severity === "critical" && a.status === "open").length))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      clearSession();
      router.replace("/login");
    }
  }

  const items = [
    ...NAV_ITEMS,
    ...(canSeeDeletionRequests ? [{ href: "/admin/deletion-requests", label: "Deletion Requests" }] : []),
    ...(canSeeWhistleblowerReports ? [{ href: "/admin/whistleblower", label: "Reports" }] : []),
    ...(session?.role === "admin" ? [{ href: "/admin/sources", label: "Sources" }] : []),
    ...(session?.role === "admin" ? [{ href: "/admin/users", label: "Manage Users" }] : []),
    ...(session?.role === "admin" ? [{ href: "/settings", label: "Settings" }] : []),
  ];

  return (
    <header className="no-print bg-deep border-b border-border">
      <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link href="/overview" className="flex items-center gap-3">
          <div className="bg-white rounded-lg p-0.5 shrink-0">
            <Image src="/logo.png" alt="THE EYE" width={38} height={38} className="rounded-md" priority />
          </div>
          <div>
            <p className="font-mono font-extrabold text-[17px] tracking-[3px] text-accent leading-none">THE EYE</p>
            <p className="text-[9px] tracking-[2px] text-muted uppercase">Intelligence &amp; Accountability Platform</p>
          </div>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {session && <span className="text-sm text-muted">{session.username}</span>}
          {!!criticalCount && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-danger bg-danger/10 border border-danger/30 rounded-full px-3 py-1">
              ⚠ {criticalCount} CRITICAL
            </span>
          )}
          <ChainIntegrityBadge />
          <ThemeToggle />
          <button onClick={handleLogout} className="text-sm text-muted hover:text-danger transition-colors cursor-pointer">
            Sign out
          </button>
        </div>
      </div>
      <nav className="flex flex-wrap gap-1 px-4 border-t border-border">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide border-b-2 transition-colors ${
                active ? "text-accent border-accent" : "text-muted border-transparent hover:text-text"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
