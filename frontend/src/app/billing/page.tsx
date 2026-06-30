"use client";
import { useEffect, useState } from "react";
import {
  getPublicPlans,
  getTenantSubscription,
  createCheckout,
  Plan,
  SubscriptionOut,
  ApiError,
} from "@/lib/api-client";

const STATUS_COLOR: Record<string, string> = {
  active:    "text-[var(--safe)]   bg-[var(--safe)]/10   border-[var(--safe)]/20",
  trialing:  "text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/20",
  past_due:  "text-[var(--warn)]   bg-[var(--warn)]/10   border-[var(--warn)]/20",
  canceled:  "text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/20",
  cancelled: "text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/20",
};

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className="text-[var(--safe)] shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlanCard({
  plan,
  isCurrent,
  onSubscribe,
  loading,
}: {
  plan: Plan;
  isCurrent: boolean;
  onSubscribe: (plan: Plan, cycle: "monthly" | "annual") => void;
  loading: string | null;
}) {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const price = cycle === "annual" ? plan.price_annual : plan.price_monthly;
  const isEnterprise = !plan.price_monthly && !plan.price_annual;
  const isLoading = loading === plan.id + cycle;

  return (
    <div className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
      isCurrent
        ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]/30"
        : "border-[var(--border)] bg-[var(--panel)] hover:border-[var(--accent)]/40"
    }`}>
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-[var(--accent)] text-[var(--void)] text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full whitespace-nowrap">
            Current Plan
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
              <span className="text-[var(--muted)] text-sm mb-1">
                /{cycle === "annual" ? "yr" : "mo"}
              </span>
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
            <button key={c} onClick={() => setCycle(c)}
              className={`flex-1 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${
                cycle === c
                  ? "bg-[var(--accent)] text-[var(--void)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}>
              {c}{c === "annual" ? " (~17% off)" : ""}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-2 flex-1 mb-6">
        {(plan.features ?? []).map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-[var(--text)]">
            <CheckIcon />{f}
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <button disabled
          className="w-full py-2.5 rounded-xl bg-[var(--accent)]/20 text-[var(--accent)] font-semibold text-sm cursor-default">
          Active Plan
        </button>
      ) : isEnterprise ? (
        <a href="mailto:sales@theeye.com"
          className="block w-full py-2.5 rounded-xl border border-[var(--border)] text-[var(--text)] font-semibold text-sm text-center hover:bg-[var(--surface)] transition-colors">
          Contact Sales
        </a>
      ) : (
        <button onClick={() => onSubscribe(plan, cycle)} disabled={!!loading}
          className="w-full py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent)]/90 disabled:opacity-50 text-[var(--void)] font-semibold text-sm transition-colors">
          {isLoading ? "Redirecting…" : "Subscribe"}
        </button>
      )}
    </div>
  );
}

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<SubscriptionOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "info" | "error" } | null>(null);

  useEffect(() => {
    Promise.all([getPublicPlans(), getTenantSubscription()])
      .then(([p, s]) => { setPlans(p); setSub(s); })
      .catch((e) => setMessage({ text: e instanceof ApiError ? e.message : "Failed to load billing.", type: "error" }))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe(plan: Plan, cycle: "monthly" | "annual") {
    setCheckoutLoading(plan.id + cycle);
    setMessage(null);
    try {
      const res = await createCheckout(plan.id, cycle);
      if (res.contact_sales) {
        setMessage({ text: res.message || "Please contact our sales team.", type: "info" });
      } else if (res.checkout_url) {
        window.location.href = res.checkout_url;
      } else {
        setMessage({ text: "Checkout unavailable. Please contact support.", type: "error" });
      }
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? e.message : "Checkout failed.", type: "error" });
    } finally {
      setCheckoutLoading(null);
    }
  }

  const statusKey = sub?.paddle_subscription_status ?? "trial";
  const statusCls = STATUS_COLOR[statusKey] ?? "text-[var(--muted)] bg-[var(--surface)] border-[var(--border)]";

  return (
    <div className="p-8 max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Billing & Subscription</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Manage your plan and payment details.</p>
      </div>

      {sub && (
        <div className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Current Plan</p>
            <p className="text-xl font-bold text-[var(--text)]">{sub.plan?.name ?? "No plan"}</p>
            {sub.plan?.description && (
              <p className="text-sm text-[var(--muted)] mt-0.5">{sub.plan.description}</p>
            )}
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${statusCls}`}>
              {statusKey}
            </span>
            {sub.paddle_subscription_id && (
              <p className="text-[10px] font-mono text-[var(--muted)]">
                Sub: {sub.paddle_subscription_id}
              </p>
            )}
          </div>
        </div>
      )}

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm ${
          message.type === "error"
            ? "bg-[var(--danger)]/5 border-[var(--danger)]/20 text-[var(--danger)]"
            : "bg-[var(--accent)]/5 border-[var(--accent)]/20 text-[var(--accent)]"
        }`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-96 bg-[var(--panel)] border border-[var(--border)] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <h2 className="text-base font-semibold text-[var(--text)]">Available Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrent={sub?.plan?.id === plan.id}
                onSubscribe={handleSubscribe}
                loading={checkoutLoading}
              />
            ))}
          </div>
        </>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
        <p className="text-sm font-semibold text-[var(--text)] mb-2">Payment & Security</p>
        <p className="text-sm text-[var(--muted)]">
          All payments are processed securely by Paddle. THE EYE never stores your card details.
          For billing queries, contact{" "}
          <a href="mailto:billing@theeye.com" className="text-[var(--accent)] hover:underline">
            billing@theeye.com
          </a>.
        </p>
      </div>
    </div>
  );
}
