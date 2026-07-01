"use client";

import { useEffect, useRef, useState } from "react";
import NavBar from "@/components/NavBar";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getSession } from "@/lib/auth";
import {
  getPublicPlans,
  getTenantSubscription,
  getBillingConfig,
  Plan,
  SubscriptionOut,
  ApiError,
} from "@/lib/api-client";

// ── Paddle.js v2 types ────────────────────────────────────────────────────────
declare global {
  interface Window {
    Paddle?: {
      Setup: (opts: {
        token: string;
        environment?: string;
        eventCallback?: (ev: { name: string; data?: Record<string, unknown> }) => void;
      }) => void;
      Checkout: {
        open: (opts: {
          items: { priceId: string; quantity: number }[];
          customer?: { email?: string };
          customData?: Record<string, string>;
          settings?: { displayMode?: string };
        }) => void;
      };
    };
  }
}

const STATUS_COLOR: Record<string, string> = {
  active:    "text-[var(--safe)]   bg-[var(--safe)]/10   border-[var(--safe)]/20",
  trialing:  "text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/20",
  past_due:  "text-[var(--warn)]   bg-[var(--warn)]/10   border-[var(--warn)]/20",
  canceled:  "text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/20",
  cancelled: "text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/20",
};

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrent,
  currentStatus,
  onSubscribe,
  loading,
}: {
  plan: Plan;
  isCurrent: boolean;
  currentStatus: string | null;
  onSubscribe: (plan: Plan, cycle: "monthly" | "annual") => void;
  loading: string | null;
}) {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const price = cycle === "annual" ? plan.price_annual : plan.price_monthly;
  const isEnterprise = !plan.price_monthly && !plan.price_annual;
  const noPaddle = !plan.has_paddle;
  const isLoading = loading === plan.id + cycle;
  const isActive = isCurrent && currentStatus === "active";

  return (
    <div className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
      isCurrent
        ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]/30"
        : "border-[var(--border)] bg-[var(--panel)] hover:border-[var(--accent)]/40"
    }`}>
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-[var(--accent)] text-[var(--void)] text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full whitespace-nowrap">
            {isActive ? "Active Plan ✓" : "Current Plan"}
          </span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-bold text-[var(--text)]">{plan.name}</h3>
        {plan.description && (
          <p className="text-sm text-[var(--muted)] mt-1">{plan.description}</p>
        )}
      </div>

      <div className="mb-5">
        {isEnterprise ? (
          <p className="text-3xl font-bold text-[var(--text)]">Custom</p>
        ) : (
          <>
            <div className="flex items-end gap-1">
              <span className="text-3xl font-bold text-[var(--text)]">
                {plan.currency === "USD" ? "$" : plan.currency}
                {price?.toFixed(0) ?? "—"}
              </span>
              <span className="text-[var(--muted)] text-sm mb-1">/{cycle === "annual" ? "yr" : "mo"}</span>
            </div>
            {cycle === "annual" && plan.price_monthly && plan.price_annual && (
              <p className="text-xs text-[var(--safe)] mt-0.5">
                Save ${((plan.price_monthly * 12) - plan.price_annual).toFixed(0)}/yr vs monthly
              </p>
            )}
          </>
        )}
      </div>

      {!isEnterprise && (
        <div className="flex gap-1 mb-5 bg-[var(--surface)] rounded-lg p-1">
          {(["monthly", "annual"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`flex-1 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${
                cycle === c ? "bg-[var(--accent)] text-[var(--void)]" : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {c}{c === "annual" ? " (save 17%)" : ""}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-2 flex-1 mb-6">
        {(plan.features ?? []).map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-[var(--text)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--safe)] shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <div className="w-full py-2.5 rounded-xl bg-[var(--accent)]/20 text-[var(--accent)] font-semibold text-sm text-center">
          {isActive ? "✓ Subscribed" : "Current Plan"}
        </div>
      ) : isEnterprise ? (
        <a
          href="mailto:sales@theeye.com"
          className="block w-full py-2.5 rounded-xl border border-[var(--border)] text-[var(--text)] font-semibold text-sm text-center hover:bg-[var(--surface)] transition-colors"
        >
          Contact Sales
        </a>
      ) : noPaddle ? (
        <div className="w-full py-2.5 rounded-xl border border-[var(--border)] text-[var(--muted)] font-semibold text-sm text-center cursor-default">
          Coming Soon
        </div>
      ) : (
        <button
          onClick={() => onSubscribe(plan, cycle)}
          disabled={!!loading}
          className="w-full py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent)]/90 disabled:opacity-50 text-[var(--void)] font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              Opening checkout…
            </>
          ) : "Subscribe Now"}
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const ready = useRequireAuth();
  const session = getSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<SubscriptionOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "info" | "error" | "success" } | null>(null);
  const paddleReady = useRef(false);

  // Load and initialise Paddle.js v2
  useEffect(() => {
    if (paddleReady.current) return;
    getBillingConfig()
      .then(({ client_token, environment }) => {
        if (!client_token) return;
        const existing = document.getElementById("paddle-js");
        if (existing) {
          initPaddle(client_token, environment);
          return;
        }
        const script = document.createElement("script");
        script.id = "paddle-js";
        script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
        script.onload = () => initPaddle(client_token, environment);
        document.head.appendChild(script);
      })
      .catch(() => { /* Paddle not configured — checkout will show a helpful error */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function initPaddle(token: string, env: string) {
    if (!window.Paddle) return;
    window.Paddle.Setup({
      token,
      ...(env === "sandbox" ? { environment: "sandbox" } : {}),
      eventCallback: (ev) => {
        if (ev.name === "checkout.completed") {
          setCheckoutLoading(null);
          setMessage({
            text: "Payment successful! Your subscription is being activated — please refresh in a moment.",
            type: "success",
          });
          getTenantSubscription().then(setSub).catch(() => null);
        }
        if (ev.name === "checkout.closed") {
          setCheckoutLoading(null);
        }
        if (ev.name === "checkout.error") {
          setCheckoutLoading(null);
          setMessage({ text: "Checkout error. Please try again or contact support.", type: "error" });
        }
      },
    });
    paddleReady.current = true;
  }

  useEffect(() => {
    if (!ready) return;
    Promise.all([
      getPublicPlans().catch((): Plan[] => []),
      getTenantSubscription().catch(() => null),
    ]).then(([p, s]) => {
      setPlans(p);
      setSub(s);
      setLoading(false);
    });
  }, [ready]);

  function handleSubscribe(plan: Plan, cycle: "monthly" | "annual") {
    setMessage(null);
    const priceId = cycle === "annual" ? plan.paddle_price_id_annual : plan.paddle_price_id_monthly;

    if (!priceId) {
      setMessage({ text: "Payment not yet configured for this plan. Contact support.", type: "error" });
      return;
    }
    if (!window.Paddle || !paddleReady.current) {
      setMessage({ text: "Payment system is loading — please wait a moment and try again.", type: "error" });
      return;
    }

    setCheckoutLoading(plan.id + cycle);
    try {
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: session?.username?.includes("@") ? { email: session.username } : undefined,
        customData: {
          tenant_id: sub?.tenant_id ?? "",
          plan_id: plan.id,
        },
        settings: { displayMode: "overlay" },
      });
    } catch {
      setCheckoutLoading(null);
      setMessage({ text: "Failed to open checkout. Please try again.", type: "error" });
    }
  }

  const statusKey = sub?.paddle_subscription_status ?? "trial";
  const statusCls = STATUS_COLOR[statusKey] ?? "text-[var(--muted)] bg-[var(--surface)] border-[var(--border)]";
  const limits = sub?.plan?.limits;

  if (!ready) return null;

  return (
    <NavBar>
      <div className="p-8 max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Billing &amp; Subscription</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Manage your plan and payment details.</p>
        </div>

        {/* Current subscription card */}
        {sub && (
          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1">
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Current Plan</p>
                <p className="text-xl font-bold text-[var(--text)]">{sub.plan?.name ?? "No plan selected"}</p>
                {sub.plan?.description && (
                  <p className="text-sm text-[var(--muted)] mt-0.5">{sub.plan.description}</p>
                )}
              </div>
              <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${statusCls}`}>
                  {statusKey.replace(/_/g, " ")}
                </span>
                {sub.paddle_subscription_id && (
                  <p className="text-[10px] font-mono text-[var(--muted)]">
                    Subscription ID: {sub.paddle_subscription_id}
                  </p>
                )}
              </div>
            </div>

            {limits && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-[var(--border)]">
                {[
                  { label: "Users",      value: limits.users              != null ? String(limits.users)              : "∞" },
                  { label: "API Keys",   value: limits.api_keys           != null ? String(limits.api_keys)           : "∞" },
                  { label: "Events/mo",  value: limits.events_per_month   != null ? (limits.events_per_month / 1000).toFixed(0) + "k" : "∞" },
                  { label: "Retention",  value: limits.retention_days     != null ? limits.retention_days + " days"   : "Custom" },
                ].map((item) => (
                  <div key={item.label} className="text-center bg-[var(--surface)] rounded-xl py-3 px-2">
                    <p className="text-lg font-bold font-mono text-[var(--text)]">{item.value}</p>
                    <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message banner */}
        {message && (
          <div className={`px-4 py-3 rounded-xl border text-sm flex items-center justify-between gap-3 ${
            message.type === "error"   ? "bg-[var(--danger)]/5 border-[var(--danger)]/20 text-[var(--danger)]" :
            message.type === "success" ? "bg-[var(--safe)]/5   border-[var(--safe)]/20   text-[var(--safe)]" :
                                         "bg-[var(--accent)]/5 border-[var(--accent)]/20 text-[var(--accent)]"
          }`}>
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="shrink-0 opacity-60 hover:opacity-100 text-lg leading-none">×</button>
          </div>
        )}

        {/* Plans grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-96 bg-[var(--panel)] border border-[var(--border)] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <h2 className="text-base font-semibold text-[var(--text)]">Choose Your Plan</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isCurrent={sub?.plan?.id === plan.id}
                  currentStatus={sub?.paddle_subscription_status ?? null}
                  onSubscribe={handleSubscribe}
                  loading={checkoutLoading}
                />
              ))}
              {plans.length === 0 && (
                <div className="col-span-3 py-16 text-center text-[var(--muted)] text-sm">
                  No plans available yet. Contact{" "}
                  <a href="mailto:support@theeye.com" className="text-[var(--accent)] hover:underline">
                    support@theeye.com
                  </a>{" "}
                  to get set up.
                </div>
              )}
            </div>
          </>
        )}

        {/* Trust bar */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex flex-wrap items-center gap-6">
            {[
              { icon: "🔒", label: "SSL encrypted checkout" },
              { icon: "🏦", label: "Payments processed by Paddle" },
              { icon: "💳", label: "Card details never stored by us" },
              { icon: "🔄", label: "Cancel anytime" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)] mt-3">
            Billing queries?{" "}
            <a href="mailto:billing@theeye.com" className="text-[var(--accent)] hover:underline">
              billing@theeye.com
            </a>
          </p>
        </div>

      </div>
    </NavBar>
  );
}
