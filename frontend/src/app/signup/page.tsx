"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signup as signupRequest, ApiError } from "@/lib/api-client";
import { isLoggedIn } from "@/lib/auth";
import Panel from "@/components/Panel";
import Button from "@/components/Button";

export default function SignupPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) router.replace("/overview");
  }, [router]);

  function handleCompanyNameChange(val: string) {
    setCompanyName(val);
    setCompanySlug(
      val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await signupRequest(companyName, companySlug, adminEmail, password);
      setDone(true);
      setTimeout(() => router.replace("/login?signup=true"), 2500);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        try {
          const body = JSON.parse(err.message);
          setError(body?.detail ?? err.message);
        } catch {
          setError(err.message);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full border border-border bg-surface text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

  return (
    <div className="flex flex-1 items-center justify-center bg-void py-10">
      <Panel className="w-full max-w-md p-6">
        {done ? (
          <div className="flex flex-col items-center text-center gap-4 py-6">
            <div className="bg-white rounded-2xl p-2 shadow-sm">
              <Image src="/logo.png" alt="THE EYE" width={80} height={80} priority />
            </div>
            <div className="w-12 h-12 rounded-full bg-[var(--safe)]/10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--safe)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="font-semibold text-[var(--safe)]">Account created!</p>
            <p className="text-sm text-[var(--muted)]">Redirecting you to sign in…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col items-center text-center gap-2 mb-2">
              <div className="bg-white rounded-2xl p-2 shadow-sm">
                <Image src="/logo.png" alt="THE EYE" width={80} height={80} priority />
              </div>
              <p className="text-[9px] tracking-[2px] text-[var(--muted)] uppercase">Intelligence &amp; Accountability Platform</p>
              <p className="text-sm text-[var(--muted)] mt-1">Create your organisation account.</p>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-lg px-3 py-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-sm text-[var(--danger)]">{error}</p>
              </div>
            )}

            {/* Company details */}
            <div className="space-y-1 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Company</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--muted)]">Company name</label>
              <input
                required
                className={inputClass}
                placeholder="Acme Corp"
                value={companyName}
                onChange={(e) => handleCompanyNameChange(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--muted)]">
                Company ID <span className="text-[var(--muted)]/60">(auto-generated, lowercase)</span>
              </label>
              <input
                required
                className={inputClass}
                placeholder="acme-corp"
                value={companySlug}
                pattern="^[a-z0-9-]+$"
                title="Lowercase letters, numbers, and hyphens only"
                onChange={(e) => setCompanySlug(e.target.value)}
              />
            </div>

            {/* Admin account */}
            <div className="space-y-1 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Admin account</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--muted)]">Work email</label>
              <input
                required
                type="email"
                className={inputClass}
                placeholder="you@company.com"
                autoComplete="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
              <p className="text-[10px] text-[var(--muted)]/70">This will be your login username.</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--muted)]">
                Password <span className="text-[var(--muted)]/60">(12+ chars, 1 uppercase, 1 number)</span>
              </label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  className={`${inputClass} pr-10`}
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--muted)]">Confirm password</label>
              <input
                required
                type={showPassword ? "text" : "password"}
                className={inputClass}
                placeholder="••••••••••••"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              className="w-full mt-2"
              disabled={loading || !companyName || !companySlug || !adminEmail || !password || !confirmPassword}
            >
              {loading ? "Creating account…" : "Create account"}
            </Button>

            <p className="text-center text-xs text-[var(--muted)]">
              Already have an account?{" "}
              <Link href="/login" className="text-[var(--accent)] hover:underline">Sign in</Link>
            </p>
          </form>
        )}
      </Panel>
    </div>
  );
}
