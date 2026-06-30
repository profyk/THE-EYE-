"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { login as loginRequest, ApiError, API_BASE } from "@/lib/api-client";
import { isLoggedIn, setSession } from "@/lib/auth";
import Panel from "@/components/Panel";
import Button from "@/components/Button";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justSignedUp = searchParams.get("signup") === "true";

  const [username, setUsername] = useState("");
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
      const session = await loginRequest(username, password);
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
        setError(`Could not reach the server (${API_BASE}) — check Vercel env NEXT_PUBLIC_API_BASE_URL.`);
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full border border-border bg-surface text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

  return (
    <div className="flex flex-1 items-center justify-center bg-void">
      <Panel className="w-full max-w-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col items-center text-center gap-2 mb-2">
            <div className="bg-white rounded-2xl p-2 shadow-sm">
              <Image src="/logo.png" alt="THE EYE" width={110} height={110} priority />
            </div>
            <p className="text-[9px] tracking-[2px] text-muted uppercase">Intelligence &amp; Accountability Platform</p>
            <p className="text-sm text-muted mt-1">Sign in with your account.</p>
          </div>

          {justSignedUp && (
            <div className="flex items-center gap-2 bg-[var(--safe)]/10 border border-[var(--safe)]/20 rounded-lg px-3 py-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--safe)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p className="text-sm text-[var(--safe)]">Account created — sign in to continue.</p>
            </div>
          )}

          <input
            type="email"
            autoFocus
            className={inputClass}
            placeholder="Email address"
            autoComplete="email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className={`${inputClass} pr-10`}
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
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

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" disabled={loading || !username || !password} className="w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>

          <p className="text-center text-xs text-muted">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-accent hover:underline">Sign up</Link>
          </p>
        </form>
      </Panel>
    </div>
  );
}
