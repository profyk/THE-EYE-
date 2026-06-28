"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { signup as signupRequest, ApiError } from "@/lib/api-client";
import { isLoggedIn } from "@/lib/auth";
import Panel from "@/components/Panel";
import Button from "@/components/Button";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Paddle?: any;
  }
}

const PADDLE_CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const PADDLE_PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID ?? "";
const PADDLE_ENV = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox";

type Step = "form" | "checkout" | "activating";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const paddleReady = useRef(false);

  useEffect(() => {
    if (isLoggedIn()) router.replace("/overview");
  }, [router]);

  // Auto-generate slug from org name
  function handleNameChange(val: string) {
    setTenantName(val);
    setTenantSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  }

  function initPaddle() {
    if (!window.Paddle || paddleReady.current) return;
    window.Paddle.Environment.set(PADDLE_ENV);
    window.Paddle.Initialize({ token: PADDLE_CLIENT_TOKEN });
    paddleReady.current = true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { tenant_id } = await signupRequest(tenantName, tenantSlug, username, password);
      setStep("checkout");

      // Give Paddle.js a tick to be ready
      await new Promise((r) => setTimeout(r, 100));
      initPaddle();

      if (!window.Paddle) {
        setError("Payment provider failed to load. Please refresh and try again.");
        setStep("form");
        return;
      }

      window.Paddle.Checkout.open({
        items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }],
        customData: { tenant_id },
        settings: {
          displayMode: "overlay",
          theme: "dark",
          locale: "en",
        },
        eventCallback(ev: { name: string }) {
          if (ev.name === "checkout.completed") {
            setStep("activating");
            setTimeout(() => router.replace("/login?activated=true"), 3000);
          }
          if (ev.name === "checkout.closed" && step !== "activating") {
            setStep("form");
          }
        },
      });
    } catch (err: unknown) {
      setError(err instanceof ApiError ? JSON.parse(err.message)?.detail ?? err.message : "Something went wrong.");
      setStep("form");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full border border-border bg-surface text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

  return (
    <>
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="afterInteractive"
        onLoad={initPaddle}
      />

      <div className="flex flex-1 items-center justify-center bg-void py-10">
        <Panel className="w-full max-w-sm p-6">
          {step === "activating" ? (
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <div className="bg-white rounded-2xl p-2 shadow-sm">
                <Image src="/logo.png" alt="THE EYE" width={80} height={80} priority />
              </div>
              <p className="font-semibold text-safe">Payment confirmed!</p>
              <p className="text-sm text-muted">Your account is being activated. Redirecting to login…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col items-center text-center gap-2 mb-2">
                <div className="bg-white rounded-2xl p-2 shadow-sm">
                  <Image src="/logo.png" alt="THE EYE" width={80} height={80} priority />
                </div>
                <p className="text-[9px] tracking-[2px] text-muted uppercase">Intelligence &amp; Accountability Platform</p>
                <p className="text-sm text-muted mt-1">Create your organisation account.</p>
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              <div className="space-y-1">
                <label className="text-xs text-muted">Organisation name</label>
                <input
                  required
                  className={inputClass}
                  placeholder="Acme Corp"
                  value={tenantName}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted">Organisation slug <span className="text-muted/60">(URL-safe, auto-generated)</span></label>
                <input
                  required
                  className={inputClass}
                  placeholder="acme-corp"
                  value={tenantSlug}
                  pattern="^[a-z0-9-]+$"
                  title="Lowercase letters, numbers, and hyphens only"
                  onChange={(e) => setTenantSlug(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted">Admin username</label>
                <input
                  required
                  className={inputClass}
                  placeholder="admin"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted">Password <span className="text-muted/60">(12+ chars, 1 uppercase, 1 number)</span></label>
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
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !tenantName || !tenantSlug || !username || !password}
              >
                {loading ? "Setting up…" : step === "checkout" ? "Opening payment…" : "Continue to payment →"}
              </Button>

              <p className="text-center text-xs text-muted">
                Already have an account?{" "}
                <Link href="/login" className="text-accent hover:underline">Sign in</Link>
              </p>
            </form>
          )}
        </Panel>
      </div>
    </>
  );
}
