"use client";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import { API_BASE } from "@/lib/api-client";

export default function SettingsPage() {
  const ready = useRequireAuth();
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    if (!ready) return;
    setTheme(localStorage.getItem("staff_theme") ?? "dark");
  }, [ready]);

  if (!ready) return null;

  function applyTheme(t: string) {
    setTheme(t);
    localStorage.setItem("staff_theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
  }

  return (
    <AppShell>
      <main className="p-8 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-text">Settings</h1>
          <p className="text-sm text-muted mt-1">Command Centre configuration.</p>
        </div>

        <div className="max-w-2xl space-y-4">
          <Panel>
            <div className="px-6 py-4 border-b border-border">
              <p className="text-sm font-semibold text-text">Appearance</p>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text">Theme</p>
                  <p className="text-xs text-muted mt-0.5">Choose interface colour mode</p>
                </div>
                <div className="flex gap-2">
                  {["dark", "light"].map((t) => (
                    <button
                      key={t}
                      onClick={() => applyTheme(t)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                        theme === t ? "bg-accent text-void" : "bg-surface text-muted hover:text-text"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel>
            <div className="px-6 py-4 border-b border-border">
              <p className="text-sm font-semibold text-text">Connection</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">Backend URL</p>
                <p className="text-xs font-mono text-text bg-surface px-3 py-1 rounded">{API_BASE}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">Portal Version</p>
                <p className="text-xs font-mono text-text">1.0.0</p>
              </div>
            </div>
          </Panel>

          <Panel>
            <div className="px-6 py-4 border-b border-border">
              <p className="text-sm font-semibold text-text">Keyboard Shortcuts</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              {[
                ["Open command palette", "⌘ K"],
                ["Close modal / dialog", "Esc"],
              ].map(([label, key]) => (
                <div key={label} className="flex items-center justify-between">
                  <p className="text-sm text-muted">{label}</p>
                  <kbd className="text-xs font-mono bg-surface border border-border rounded px-2 py-0.5 text-text">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="px-6 py-4 border-b border-border">
              <p className="text-sm font-semibold text-text">Security Notices</p>
            </div>
            <div className="px-6 py-5 space-y-2">
              <p className="text-xs text-muted leading-relaxed">
                This portal is restricted to <strong className="text-text">super_admin</strong> accounts only.
                All actions are tamper-evidently logged in the ledger. Unauthorised access attempts are recorded and reported.
              </p>
              <p className="text-xs text-muted leading-relaxed">
                Ensure your <code className="bg-surface rounded px-1 text-[11px]">RECOVERY_TOKEN</code> Railway
                environment variable is deleted once initial setup is complete.
              </p>
            </div>
          </Panel>
        </div>
      </main>
    </AppShell>
  );
}
