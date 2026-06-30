"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { login as loginRequest, ApiError, API_BASE } from "@/lib/api-client";
import { isLoggedIn, setSession } from "@/lib/auth";

const ICON = "/app-icon.png";

const CAPABILITIES = [
  "Full tenant lifecycle management",
  "Cross-tenant user visibility",
  "Platform billing & subscription control",
  "System health and audit analytics",
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("staff_theme");
    document.documentElement.classList.toggle("dark", saved !== "light");
    if (isLoggedIn()) router.replace("/dashboard");
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await loginRequest(username, password);
      if (session.role !== "super_admin") {
        setError("Access denied — staff credentials required.");
        setLoading(false);
        return;
      }
      setSession(session);
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Invalid credentials.");
      } else if (err instanceof ApiError) {
        setError(`Server error (${err.status}).`);
      } else {
        setError(`Could not reach server (${API_BASE}).`);
      }
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-xl px-4 py-3 text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-colors duration-150";

  return (
    <div className="flex flex-1 flex-col lg:flex-row min-h-screen">

      {/* ── Left branding panel ───────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative flex-col items-center justify-center bg-[var(--deep)] overflow-hidden">

        {/* Radial accent glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 65% 55% at 50% 42%, rgba(0,212,255,0.08) 0%, transparent 68%)",
          }}
        />
        {/* Grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        {/* Vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 120% 120% at 50% 50%, transparent 50%, var(--deep) 100%)",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center gap-8 px-12">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-[28px] blur-3xl scale-125 opacity-35"
              style={{ background: "radial-gradient(circle, rgba(0,212,255,0.6) 0%, transparent 65%)" }}
            />
            <Image
              src={ICON}
              alt="THE EYE"
              width={160}
              height={160}
              className="relative rounded-[28px] shadow-2xl"
              priority
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-4xl font-black tracking-tight text-[var(--text)]">THE EYE</h2>
            <p className="text-[10px] tracking-[5px] uppercase font-bold" style={{ color: "var(--accent)" }}>
              Command Centre
            </p>
            <p className="text-xs text-[var(--muted)] mt-1">Authorised personnel only.</p>
          </div>

          <div className="space-y-3 max-w-[260px] text-left">
            {CAPABILITIES.map((c) => (
              <div key={c} className="flex items-start gap-3">
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }}
                />
                <p className="text-xs leading-snug" style={{ color: "var(--muted)" }}>{c}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="absolute bottom-7 text-[9px] tracking-[3px] uppercase" style={{ color: "rgba(90,106,128,0.4)" }}>
          All access is logged and audited.
        </p>
      </div>

      {/* ── Right form panel ──────────────────────────────────────── */}
      <div
        className="flex flex-1 lg:w-[48%] xl:w-[45%] items-center py-16 lg:py-0"
        style={{ background: "var(--void)" }}
      >
        <div className="w-full flex flex-col justify-center px-8 sm:px-12 lg:px-14 xl:px-20 max-w-lg mx-auto">

          {/* Mobile logo */}
          <div className="flex lg:hidden flex-col items-center mb-10 gap-3">
            <Image src={ICON} alt="THE EYE" width={72} height={72} className="rounded-2xl shadow-lg" priority />
            <p className="text-[10px] tracking-[3px] text-[var(--accent)] uppercase font-semibold">
              Command Centre
            </p>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-extrabold text-[var(--text)] tracking-tight">Staff Sign In</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Restricted to super_admin credentials.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                Username
              </label>
              <input
                type="text"
                autoFocus
                required
                autoComplete="username"
                className={inputCls}
                placeholder="staff@the-eye.io"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className={`${inputCls} pr-12`}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-xl px-4 py-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-sm text-[var(--danger)]">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full mt-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold tracking-wide transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)",
                color: "var(--void)",
                boxShadow: loading || !username || !password ? "none" : "0 0 20px rgba(0,212,255,0.2)",
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Authenticating…
                </>
              ) : (
                <>
                  Sign in
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          <p className="text-center text-[10px] text-[var(--muted)] mt-8 tracking-widest uppercase">
            Authorised personnel only · All access is logged
          </p>
        </div>
      </div>
    </div>
  );
}
