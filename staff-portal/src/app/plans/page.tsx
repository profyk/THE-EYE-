"use client";
import { useEffect, useState, useCallback } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import AppShell from "@/components/AppShell";
import Panel from "@/components/Panel";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";
import {
  staffListPlans,
  staffCreatePlan,
  staffUpdatePlan,
  StaffPlan,
  PlanCreatePayload,
  ApiError,
} from "@/lib/api-client";

// ── Plan Modal ────────────────────────────────────────────────────────────────

function PlanModal({
  plan,
  onClose,
  onSave,
}: {
  plan: StaffPlan | null;
  onClose: () => void;
  onSave: (saved: StaffPlan) => void;
}) {
  const isEdit = !!plan;
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    slug: plan?.slug ?? "",
    description: plan?.description ?? "",
    price_monthly: plan?.price_monthly?.toString() ?? "",
    price_annual: plan?.price_annual?.toString() ?? "",
    paddle_price_id_monthly: plan?.paddle_price_id_monthly ?? "",
    paddle_price_id_annual: plan?.paddle_price_id_annual ?? "",
    features: (plan?.features ?? []).join("\n"),
    sort_order: plan?.sort_order?.toString() ?? "0",
    is_public: plan?.is_public ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, val: string | boolean) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: PlanCreatePayload = {
        name: form.name,
        slug: form.slug,
        description: form.description || undefined,
        price_monthly: form.price_monthly ? parseFloat(form.price_monthly) : undefined,
        price_annual: form.price_annual ? parseFloat(form.price_annual) : undefined,
        paddle_price_id_monthly: form.paddle_price_id_monthly || undefined,
        paddle_price_id_annual: form.paddle_price_id_annual || undefined,
        features: form.features
          ? form.features.split("\n").map((l) => l.trim()).filter(Boolean)
          : undefined,
        sort_order: parseInt(form.sort_order) || 0,
        is_public: form.is_public,
      };
      const saved = isEdit
        ? await staffUpdatePlan(plan.id, payload)
        : await staffCreatePlan(payload);
      onSave(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full bg-surface border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors";
  const labelCls = "block text-[10px] text-muted uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] pb-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-panel border border-border rounded-2xl shadow-2xl">
        <div className="px-6 py-5 border-b border-border">
          <h2 className="text-base font-semibold text-text">
            {isEdit ? `Edit: ${plan.name}` : "New Plan"}
          </h2>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Plan Name</label>
              <input
                type="text" required value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Slug</label>
              <input
                type="text" required value={form.slug}
                onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                className={inputCls} placeholder="starter"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2} className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Monthly Price (USD)</label>
              <input
                type="number" step="0.01" min="0" value={form.price_monthly}
                onChange={(e) => set("price_monthly", e.target.value)}
                className={inputCls} placeholder="29.00"
              />
            </div>
            <div>
              <label className={labelCls}>Annual Price (USD)</label>
              <input
                type="number" step="0.01" min="0" value={form.price_annual}
                onChange={(e) => set("price_annual", e.target.value)}
                className={inputCls} placeholder="290.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Paddle Price ID (Monthly)</label>
              <input
                type="text" value={form.paddle_price_id_monthly}
                onChange={(e) => set("paddle_price_id_monthly", e.target.value)}
                className={inputCls} placeholder="pri_01..."
              />
            </div>
            <div>
              <label className={labelCls}>Paddle Price ID (Annual)</label>
              <input
                type="text" value={form.paddle_price_id_annual}
                onChange={(e) => set("paddle_price_id_annual", e.target.value)}
                className={inputCls} placeholder="pri_01..."
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Features (one per line)</label>
            <textarea
              value={form.features}
              onChange={(e) => set("features", e.target.value)}
              rows={5} className={inputCls}
              placeholder={"Up to 5 users\n50,000 events/month\nEmail alerts"}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Sort Order</label>
              <input
                type="number" value={form.sort_order}
                onChange={(e) => set("sort_order", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Visibility</label>
              <div className="flex gap-2 mt-1">
                {[true, false].map((v) => (
                  <button
                    key={String(v)} type="button" onClick={() => set("is_public", v)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      form.is_public === v ? "bg-accent text-void" : "bg-surface text-muted hover:text-text"
                    }`}
                  >
                    {v ? "Public" : "Private"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg bg-surface text-muted border border-border text-sm hover:text-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-lg bg-accent hover:bg-accent-dim disabled:opacity-40 text-void font-bold text-sm transition-colors"
            >
              {loading ? "Saving…" : isEdit ? "Save Changes" : "Create Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlansPage() {
  const ready = useRequireAuth();
  const [plans, setPlans] = useState<StaffPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<StaffPlan | null | "new">(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPlans(await staffListPlans());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load plans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  function handleSaved(saved: StaffPlan) {
    setPlans((ps) => {
      const exists = ps.find((p) => p.id === saved.id);
      return exists ? ps.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...ps];
    });
    setModal(null);
  }

  async function handleArchive(plan: StaffPlan) {
    if (
      !confirm(
        `Archive "${plan.name}"? Existing subscribers keep their plan but it won't appear for new clients.`,
      )
    ) return;
    setArchiving(plan.id);
    try {
      const updated = await staffUpdatePlan(plan.id, { is_active: false });
      setPlans((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
    } catch {
      alert("Failed to archive plan.");
    } finally {
      setArchiving(null);
    }
  }

  if (!ready) return null;

  const active = plans.filter((p) => p.is_active);
  const totalTenants = plans.reduce((s, p) => s + p.tenant_count, 0);
  const withPaddle = plans.filter((p) => p.paddle_price_id_monthly || p.paddle_price_id_annual);

  return (
    <>
      {modal !== null && (
        <PlanModal
          plan={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSaved}
        />
      )}
      <AppShell>
        <main className="p-8 space-y-8 animate-fade-in">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-text tracking-tight">Subscription Plans</h1>
              <p className="text-sm text-muted mt-1">
                Create and manage pricing plans. Attach Paddle Price IDs to enable live checkout.
              </p>
            </div>
            <button
              onClick={() => setModal("new")}
              className="shrink-0 flex items-center gap-2 bg-accent hover:bg-accent-dim text-void font-bold px-4 py-2 rounded-lg text-sm transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Plan
            </button>
          </div>

          {error && (
            <div className="bg-danger/5 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Plans" value={plans.length} tone="accent" />
            <StatCard label="Active" value={active.length} tone="safe" />
            <StatCard label="Subscribed Tenants" value={totalTenants} tone="accent" />
            <StatCard label="Checkout Enabled" value={withPaddle.length} tone="muted" sub="Have Paddle ID" />
          </div>

          <Panel>
            <div className="px-6 py-4 border-b border-border">
              <p className="text-sm font-semibold text-text">All Plans</p>
            </div>
            {loading ? (
              <div className="px-6 py-10 text-center text-muted text-sm">Loading…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider">
                      <th className="px-6 py-3 text-left font-semibold">Plan</th>
                      <th className="px-4 py-3 text-right font-semibold">Monthly</th>
                      <th className="px-4 py-3 text-right font-semibold">Annual</th>
                      <th className="px-4 py-3 text-left font-semibold">Paddle IDs</th>
                      <th className="px-4 py-3 text-right font-semibold">Tenants</th>
                      <th className="px-4 py-3 text-center font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => (
                      <tr
                        key={plan.id}
                        className={`border-b border-border/50 hover:bg-surface/50 transition-colors ${!plan.is_active ? "opacity-50" : ""}`}
                      >
                        <td className="px-6 py-3">
                          <p className="font-medium text-text">{plan.name}</p>
                          <p className="text-[10px] text-muted font-mono">{plan.slug}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-text">
                          {plan.price_monthly != null
                            ? `$${plan.price_monthly.toFixed(2)}`
                            : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-text">
                          {plan.price_annual != null
                            ? `$${plan.price_annual.toFixed(2)}`
                            : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            {plan.paddle_price_id_monthly
                              ? <p className="text-[10px] font-mono text-safe truncate max-w-[160px]">{plan.paddle_price_id_monthly}</p>
                              : <p className="text-[10px] text-muted">No monthly ID</p>}
                            {plan.paddle_price_id_annual
                              ? <p className="text-[10px] font-mono text-safe truncate max-w-[160px]">{plan.paddle_price_id_annual}</p>
                              : <p className="text-[10px] text-muted">No annual ID</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-accent font-semibold">
                          {plan.tenant_count}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={plan.is_active ? "active" : "suspended"}>
                            {plan.is_active ? "Active" : "Archived"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setModal(plan)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-surface hover:bg-surface/80 text-muted hover:text-text border border-border transition-colors"
                            >
                              Edit
                            </button>
                            {plan.is_active && (
                              <button
                                onClick={() => handleArchive(plan)}
                                disabled={archiving === plan.id}
                                className="text-xs px-2.5 py-1 rounded-lg bg-danger/5 hover:bg-danger/10 text-danger border border-danger/20 transition-colors"
                              >
                                {archiving === plan.id ? "…" : "Archive"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {plans.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-muted">
                          No plans yet. Create your first plan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel>
            <div className="px-6 py-4 border-b border-border">
              <p className="text-sm font-semibold text-text">Paddle Integration Guide</p>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm text-muted">
              <p>To activate live checkout for a plan:</p>
              <ol className="list-decimal list-inside space-y-2 ml-2">
                <li>Create a product in your <strong className="text-text">Paddle Dashboard</strong> with monthly and/or annual prices.</li>
                <li>Copy the <strong className="text-text">Price IDs</strong> (format: <code className="font-mono text-xs bg-surface border border-border rounded px-1.5 py-0.5">pri_01…</code>).</li>
                <li>Edit the plan here and paste the Price IDs into the Paddle fields.</li>
                <li>
                  Set these on Railway:
                  <code className="ml-1 font-mono text-xs bg-surface border border-border rounded px-1.5 py-0.5">PADDLE_API_KEY</code>,{" "}
                  <code className="font-mono text-xs bg-surface border border-border rounded px-1.5 py-0.5">PADDLE_WEBHOOK_SECRET</code>,{" "}
                  <code className="font-mono text-xs bg-surface border border-border rounded px-1.5 py-0.5">PADDLE_ENVIRONMENT=production</code>
                </li>
                <li>
                  Register the webhook URL in Paddle Notifications:{" "}
                  <code className="font-mono text-xs bg-surface border border-border rounded px-1.5 py-0.5">POST /v1/billing/webhook</code>
                </li>
              </ol>
              <p className="pt-1">
                Enterprise plans (no price set) show a "Contact Sales" link instead of a checkout button.
              </p>
            </div>
          </Panel>
        </main>
      </AppShell>
    </>
  );
}
