"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { login as loginRequest, ApiError, API_BASE } from "@/lib/api-client";
import { isLoggedIn, setSession } from "@/lib/auth";

const ICON = "/app-icon.png";

const FEATURES = [
  "Tamper-evident hash-chained audit ledger",
  "Real-time agent monitoring across machines",
  "Multi-tenant RBAC with forensic-grade controls",
];

// useSearchParams must be inside Suspense in Next.js App Router
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justSignedUp = searchParams.get("signup") === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) router.replace("/overview");
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await loginRequest(email, password);
      setSession(session);
      router.replace("/overview");
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 402) {
        setError("Your subscription is inactive. Please renew your plan to continue.");
      } else if (err instanceof ApiError && err.status === 401) {
        setError("Invalid email or password.");
      } else if (err instanceof ApiError) {
        setError(`Server error (${err.status}) — check Railway logs.`);
      } else {
        setError(`Could not reach the server (${API_BASE}).`);
      }
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-xl px-4 py-3 text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-colors duration-150";

  return (
    <div className="w-full flex flex-col justify-center px-8 sm:px-12 lg:px-14 xl:px-20 max-w-lg mx-auto">

      {/* Mobile-only logo */}
      <div className="flex lg:hidden flex-col items-center mb-10 gap-3">
        <Image src={ICON} alt="THE EYE" width={72} height={72} className="rounded-2xl shadow-lg" priority />
        <p className="text-[10px] tracking-[3px] text-[var(--accent)] uppercase font-semibold">
          Intelligence &amp; Accountability
        </p>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-[var(--text)] tracking-tight">Welcome back</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Sign in to your THE EYE account.</p>
      </div>

      {justSignedUp && (
        <div className="flex items-center gap-3 bg-[var(--safe)]/10 border border-[var(--safe)]/25 rounded-xl px-4 py-3 mb-5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--safe)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <p className="text-sm text-[var(--safe)] font-medium">Account created — sign in to continue.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            Email address
          </label>
          <input
            type="email"
            autoFocus
            required
            className={inputCls}
            placeholder="you@company.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              className={`${inputCls} pr-12`}
              placeholder="••••••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
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
          disabled={loading || !email || !password}
          className="w-full mt-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold tracking-wide transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)",
            color: "var(--void)",
            boxShadow: loading || !email || !password ? "none" : "0 0 20px rgba(0,212,255,0.25)",
          }}
        >
          {loading ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Signing in…
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

      <p className="text-center text-xs text-[var(--muted)] mt-6">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-[var(--accent)] hover:underline font-semibold">
          Create one free
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col lg:flex-row min-h-full">

      {/* ── Left branding panel ───────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative flex-col items-center justify-center bg-[var(--deep)] overflow-hidden">

        {/* Radial glow behind icon */}
        <div
          className="absolute pointer-events-none"
          style={{
            inset: 0,
            background: "radial-gradient(ellipse 65% 55% at 50% 42%, rgba(0,212,255,0.09) 0%, transparent 68%)",
          }}
        />

        {/* Subtle grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        {/* Vignette edges */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 120% 120% at 50% 50%, transparent 50%, var(--deep) 100%)",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center gap-8 px-12">
          {/* Logo with glow */}
          <div className="relative">
            <div
              className="absolute inset-0 rounded-[28px] blur-3xl scale-125 opacity-40"
              style={{ background: "radial-gradient(circle, rgba(0,212,255,0.6) 0%, transparent 65%)" }}
            />
            <Image
              src={ICON}
              alt="THE EYE"
              width={168}
              height={168}
              className="relative rounded-[28px] shadow-2xl"
              priority
            />
          </div>

          {/* Brand */}
          <div className="space-y-2">
            <h2 className="text-4xl font-black tracking-tight text-[var(--text)]">THE EYE</h2>
            <p className="text-[11px] tracking-[5px] uppercase font-bold" style={{ color: "var(--accent)" }}>
              Intelligence &amp; Accountability
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-3 max-w-[260px] text-left">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-start gap-3">
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }}
                />
                <p className="text-xs leading-snug" style={{ color: "var(--muted)" }}>{f}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="absolute bottom-7 text-[9px] tracking-[3px] uppercase" style={{ color: "rgba(90,106,128,0.5)" }}>
          Secure · Immutable · Accountable
        </p>
      </div>

      {/* ── Right form panel ──────────────────────────────────────── */}
      <div
        className="flex flex-1 lg:w-[48%] xl:w-[45%] items-center py-14 lg:py-0"
        style={{ background: "var(--void)" }}
      >
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>

    </div>
  );
}
