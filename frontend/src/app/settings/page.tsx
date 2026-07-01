"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import Button from "@/components/Button";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getSession } from "@/lib/auth";
import { applyTheme, initialTheme, Theme } from "@/lib/theme";
import {
  getChainSummary, getTenantSubscription, listUsers, createUser,
  deactivateUser, resetUserPassword, getTenantProfile, updateTenantProfile,
  changePassword, requestAccountDeletion, cancelAccountDeletion,
  ApiError, ChainSummary, SubscriptionOut, UserRead, TenantProfile,
} from "@/lib/api-client";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLES = [
  "admin", "investigator", "chief_auditor",
  "compliance_officer", "security_officer", "executive_authority",
];
function fmtRole(r: string) {
  return r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function timeAgo(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_COLOR: Record<string, string> = {
  active:    "text-[var(--safe)]   bg-[var(--safe)]/10   border-[var(--safe)]/20",
  trialing:  "text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/20",
  past_due:  "text-[var(--warn)]   bg-[var(--warn)]/10   border-[var(--warn)]/20",
  canceled:  "text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/20",
  cancelled: "text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/20",
};

const COUNTRIES = [
  "South Africa", "United States", "United Kingdom", "Australia", "Canada",
  "Germany", "France", "India", "Nigeria", "Kenya", "Ghana", "Zimbabwe",
  "Botswana", "Namibia", "Zambia", "Tanzania", "Uganda", "Rwanda",
  "Egypt", "Netherlands", "Singapore", "New Zealand", "Other",
];

const INDUSTRIES = [
  "Government & Public Sector", "Healthcare", "Finance & Banking", "Legal",
  "Education", "Manufacturing", "Technology", "Retail", "Real Estate",
  "Non-Profit", "Mining & Resources", "Transport & Logistics", "Other",
];

const inputCls = "w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors";

// ── Small components ──────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
      {subtitle && <p className="text-sm text-[var(--muted)] mt-0.5">{subtitle}</p>}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${value ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? "left-5" : "left-0.5"}`} />
    </button>
  );
}

function pwStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map = [
    { label: "Too short", color: "bg-[var(--border)]" },
    { label: "Weak",      color: "bg-[var(--danger)]" },
    { label: "Fair",      color: "bg-[var(--warn)]" },
    { label: "Good",      color: "bg-[var(--accent)]" },
    { label: "Strong",    color: "bg-[var(--safe)]" },
    { label: "Very Strong", color: "bg-[var(--safe)]" },
  ];
  return { score, ...map[Math.min(score, 5)] };
}

// ── Appearance section ────────────────────────────────────────────────────────

function AppearanceSection() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => { setTheme(initialTheme()); }, []);
  function pick(t: Theme) { applyTheme(t); setTheme(t); }
  return (
    <div className="grid grid-cols-2 gap-3">
      {(["light", "dark"] as Theme[]).map((t) => {
        const active = theme === t;
        return (
          <button key={t} onClick={() => pick(t)}
            className={`relative rounded-xl border-2 p-4 text-left transition-all ${
              active ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/40"
            }`}>
            <div className={`rounded-lg mb-3 h-16 overflow-hidden flex flex-col gap-1 p-2 ${
              t === "dark" ? "bg-zinc-900" : "bg-white border border-zinc-200"
            }`}>
              <div className={`h-2 w-2/3 rounded-full ${t === "dark" ? "bg-zinc-600" : "bg-zinc-200"}`} />
              <div className={`h-1.5 w-full rounded-full ${t === "dark" ? "bg-zinc-700" : "bg-zinc-100"}`} />
              <div className={`h-1.5 w-4/5 rounded-full ${t === "dark" ? "bg-zinc-700" : "bg-zinc-100"}`} />
              <div className={`mt-1 h-3 w-1/3 rounded-md ${t === "dark" ? "bg-cyan-600" : "bg-blue-500"}`} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold capitalize text-[var(--text)]">{t}</span>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                active ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"
              }`}>
                {active && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Company Profile section ───────────────────────────────────────────────────

function CompanyProfileSection() {
  const [profile, setProfile] = useState<Partial<TenantProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    getTenantProfile()
      .then((p) => setProfile(p))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const updated = await updateTenantProfile({
        name: profile.name,
        contact_email: profile.contact_email || null,
        phone: profile.phone || null,
        website: profile.website || null,
        country: profile.country || null,
        industry: profile.industry || null,
        logo_url: profile.logo_url || null,
        profile_description: profile.profile_description || null,
      });
      setProfile(updated);
      setStatus({ text: "Profile saved successfully.", ok: true });
    } catch (e: unknown) {
      setStatus({ text: e instanceof ApiError ? e.message : "Save failed.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  function set(field: keyof TenantProfile, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading profile…</p>;

  return (
    <Panel>
      <form onSubmit={save} className="divide-y divide-[var(--border)]/60">
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--muted)] uppercase tracking-wider mb-1.5">Organisation Name</label>
            <input className={inputCls} value={profile.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Acme Corp" />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] uppercase tracking-wider mb-1.5">Contact Email</label>
            <input className={inputCls} type="email" value={profile.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} placeholder="admin@company.com" />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] uppercase tracking-wider mb-1.5">Phone</label>
            <input className={inputCls} type="tel" value={profile.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+27 11 000 0000" />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] uppercase tracking-wider mb-1.5">Website</label>
            <input className={inputCls} type="url" value={profile.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://company.com" />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] uppercase tracking-wider mb-1.5">Country</label>
            <select className={inputCls} value={profile.country ?? ""} onChange={(e) => set("country", e.target.value)}>
              <option value="">Select country…</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] uppercase tracking-wider mb-1.5">Industry</label>
            <select className={inputCls} value={profile.industry ?? ""} onChange={(e) => set("industry", e.target.value)}>
              <option value="">Select industry…</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-[var(--muted)] uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              className={`${inputCls} resize-none h-20`}
              value={profile.profile_description ?? ""}
              onChange={(e) => set("profile_description", e.target.value)}
              placeholder="Brief description of your organisation…"
            />
          </div>
        </div>
        <div className="px-5 py-4 flex items-center gap-3">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Profile"}</Button>
          {status && (
            <p className={`text-sm ${status.ok ? "text-[var(--safe)]" : "text-[var(--danger)]"}`}>{status.text}</p>
          )}
        </div>
      </form>
    </Panel>
  );
}

// ── Security section ──────────────────────────────────────────────────────────

function SecuritySection() {
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const strength = pwStrength(newPw);
  const mismatch = confirm.length > 0 && newPw !== confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch || newPw.length < 12) return;
    setSaving(true);
    setStatus(null);
    try {
      await changePassword(current, newPw);
      setStatus({ text: "Password changed successfully.", ok: true });
      setCurrent(""); setNewPw(""); setConfirm("");
    } catch (e: unknown) {
      setStatus({ text: e instanceof ApiError ? e.message : "Password change failed.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  function EyeIcon({ show }: { show: boolean }) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {show
          ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
          : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
        }
      </svg>
    );
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <p className="text-sm font-semibold text-[var(--text)]">Change Password</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">Min. 12 characters · at least one uppercase letter and digit</p>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-3">
          {status && (
            <p className={`text-sm ${status.ok ? "text-[var(--safe)]" : "text-[var(--danger)]"}`}>{status.text}</p>
          )}
          {/* Current password */}
          <div className="relative">
            <input
              required
              type={showCurrent ? "text" : "password"}
              placeholder="Current password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={`${inputCls} pr-10`}
            />
            <button type="button" tabIndex={-1} onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]">
              <EyeIcon show={showCurrent} />
            </button>
          </div>
          {/* New password */}
          <div className="relative">
            <input
              required
              type={showNew ? "text" : "password"}
              placeholder="New password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className={`${inputCls} pr-10`}
            />
            <button type="button" tabIndex={-1} onClick={() => setShowNew((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]">
              <EyeIcon show={showNew} />
            </button>
          </div>
          {/* Strength meter */}
          {newPw.length > 0 && (
            <div>
              <div className="flex gap-1 mb-1">
                {[1,2,3,4,5].map((i) => (
                  <div key={i} className={`flex-1 h-1 rounded-full transition-colors ${i <= strength.score ? strength.color : "bg-[var(--border)]"}`} />
                ))}
              </div>
              <p className="text-[10px] text-[var(--muted)]">{strength.label}</p>
            </div>
          )}
          {/* Confirm */}
          <div>
            <input
              required
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`${inputCls} ${mismatch ? "border-[var(--danger)]/60" : ""}`}
            />
            {mismatch && <p className="text-xs text-[var(--danger)] mt-1">Passwords do not match</p>}
          </div>
          <Button type="submit" disabled={saving || mismatch || newPw.length < 12}>
            {saving ? "Changing…" : "Change Password"}
          </Button>
        </form>
      </Panel>

      <Panel>
        <div className="px-5 py-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Active Sessions</p>
            <p className="text-xs text-[var(--muted)] mt-0.5">Sessions expire automatically after 24 hours. To sign out of all devices, change your password above.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ── Notifications section ─────────────────────────────────────────────────────

const NOTIF_KEY = "eye_notif_prefs";
interface NotifPrefs { critical_alerts: boolean; weekly_digest: boolean; new_member: boolean; }

function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotifPrefs>({ critical_alerts: true, weekly_digest: true, new_member: false });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(NOTIF_KEY);
      if (stored) setPrefs(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  function update(key: keyof NotifPrefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try { localStorage.setItem(NOTIF_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  const items: { key: keyof NotifPrefs; label: string; desc: string }[] = [
    { key: "critical_alerts", label: "Critical alert emails",  desc: "Receive an email when a critical security event is detected" },
    { key: "weekly_digest",   label: "Weekly digest",          desc: "A summary of platform activity every Monday morning" },
    { key: "new_member",      label: "New team member alerts", desc: "Email when a new user is added to your workspace" },
  ];

  return (
    <Panel>
      <div className="divide-y divide-[var(--border)]/60">
        {items.map((item) => (
          <div key={item.key} className="px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">{item.label}</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">{item.desc}</p>
            </div>
            <Toggle value={prefs[item.key]} onChange={(v) => update(item.key, v)} />
          </div>
        ))}
        <div className="px-5 py-3">
          <p className="text-xs text-[var(--muted)]">Notification emails will be sent to your account username/email.</p>
        </div>
      </div>
    </Panel>
  );
}

// ── Team panel ────────────────────────────────────────────────────────────────

function TeamPanel({ isAdmin }: { isAdmin: boolean }) {
  const [users, setUsers] = useState<UserRead[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState("admin");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [resettingPw, setResettingPw] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [resetTarget, setResetTarget] = useState<string | null>(null);

  const load = () =>
    listUsers()
      .then(setUsers)
      .catch((e: unknown) => setLoadErr(e instanceof ApiError ? e.message : "Failed to load team"));

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null); setSaving(true);
    try {
      await createUser(username, password, role);
      setUsername(""); setPassword(""); setRole("admin"); setShowForm(false);
      await load();
    } catch (e: unknown) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to create user");
    } finally { setSaving(false); }
  }

  async function handleDeactivate(id: string) {
    setDeactivating(id);
    try { await deactivateUser(id); await load(); }
    finally { setDeactivating(null); }
  }

  async function handleResetPw(id: string) {
    if (!newPw) return;
    setResettingPw(id);
    try { await resetUserPassword(id, newPw); setResetTarget(null); setNewPw(""); }
    catch { /* ignore */ }
    finally { setResettingPw(null); }
  }

  if (!isAdmin) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionHeader title="Team Members" subtitle="Manage who has access to this workspace." />
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Invite member
          </button>
        )}
      </div>
      {loadErr && <p className="text-sm text-[var(--danger)] mb-3">{loadErr}</p>}
      {showForm && (
        <Panel className="mb-4 p-5">
          <p className="text-sm font-semibold text-[var(--text)] mb-3">New Team Member</p>
          {formErr && <p className="text-xs text-[var(--danger)] mb-2">{formErr}</p>}
          <form onSubmit={handleCreate} className="space-y-3">
            <input required placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
            <div className="relative">
              <input required type={showPw ? "text" : "password"} placeholder="Password (12+ characters)"
                value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-10`} />
              <button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showPw
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                  }
                </svg>
              </button>
            </div>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
              {ROLES.map((r) => <option key={r} value={r}>{fmtRole(r)}</option>)}
            </select>
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create member"}</Button>
              <Button type="button" variant="ghost" tone="muted" onClick={() => { setShowForm(false); setFormErr(null); }}>Cancel</Button>
            </div>
          </form>
        </Panel>
      )}
      <Panel>
        {users.length === 0 && !loadErr ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--muted)]">No team members yet.</div>
        ) : (
          <div className="divide-y divide-[var(--border)]/60">
            {users.map((u) => {
              const initials = u.username.slice(0, 2).toUpperCase();
              const isResetting = resetTarget === u.id;
              return (
                <div key={u.id} className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      u.is_active ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--surface)] text-[var(--muted)]"
                    }`}>{initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold ${u.is_active ? "text-[var(--text)]" : "text-[var(--muted)] line-through"}`}>
                          {u.username}
                        </p>
                        {!u.is_active && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border text-[var(--muted)] bg-[var(--surface)] border-[var(--border)]">Inactive</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--muted)]">{fmtRole(u.role)}</p>
                    </div>
                    {u.is_active && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => { setResetTarget(isResetting ? null : u.id); setNewPw(""); }}
                          className="text-xs text-[var(--muted)] hover:text-[var(--text)] px-2 py-1 rounded-lg hover:bg-[var(--surface)] transition-colors">
                          Reset pw
                        </button>
                        <button onClick={() => handleDeactivate(u.id)} disabled={deactivating === u.id}
                          className="text-xs text-[var(--muted)] hover:text-[var(--danger)] px-2 py-1 rounded-lg hover:bg-[var(--danger)]/10 transition-colors disabled:opacity-50">
                          {deactivating === u.id ? "…" : "Remove"}
                        </button>
                      </div>
                    )}
                  </div>
                  {isResetting && (
                    <div className="mt-3 flex gap-2 pl-12">
                      <input type="password" placeholder="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                        className="flex-1 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[var(--accent)]/60" />
                      <button onClick={() => handleResetPw(u.id)} disabled={!newPw || resettingPw === u.id}
                        className="text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80 disabled:opacity-40 px-3">
                        {resettingPw === u.id ? "…" : "Save"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Danger Zone ───────────────────────────────────────────────────────────────

type DeletionStep = "idle" | "password" | "confirm" | "pending";

function DangerZone({ profile }: { profile: Partial<TenantProfile> | null }) {
  const [step, setStep] = useState<DeletionStep>(
    profile?.pending_deletion ? "pending" : "idle"
  );
  const [password, setPassword] = useState("");
  const [reason, setReason]     = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  // Sync from loaded profile
  useEffect(() => {
    if (profile?.pending_deletion) setStep("pending");
  }, [profile?.pending_deletion]);

  async function submitRequest() {
    if (confirmText !== "DELETE") return;
    setBusy(true); setErr(null);
    try {
      await requestAccountDeletion(password, reason || "Account deletion requested by admin");
      setStep("pending");
      setPassword(""); setConfirmText(""); setReason("");
    } catch (e: unknown) {
      setErr(e instanceof ApiError ? e.message : "Request failed. Please try again.");
    } finally { setBusy(false); }
  }

  async function cancelRequest() {
    setBusy(true); setErr(null);
    try {
      await cancelAccountDeletion();
      setStep("idle");
    } catch (e: unknown) {
      setErr(e instanceof ApiError ? e.message : "Cancel failed. Please try again.");
    } finally { setBusy(false); }
  }

  // ── Pending banner ────────────────────────────────────────────────────────
  if (step === "pending") {
    const requestedAt = profile?.deletion_requested_at
      ? new Date(profile.deletion_requested_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
      : "recently";
    return (
      <div className="space-y-4">
        <Panel className="border-[var(--danger)]/50 bg-[var(--danger)]/5">
          <div className="px-5 py-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-[var(--danger)]/15 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger-color, #ef4444)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--danger)]">Account Deletion Pending</p>
              <p className="text-xs text-[var(--muted)] mt-1">
                Deletion request submitted {requestedAt}. Your account is suspended and awaiting staff approval. All data is preserved until permanently approved.
              </p>
              {profile?.deletion_reason && (
                <p className="text-xs text-[var(--muted)] mt-1 italic">Reason: {profile.deletion_reason}</p>
              )}
            </div>
          </div>
          {err && <p className="px-5 pb-3 text-xs text-[var(--danger)]">{err}</p>}
          <div className="px-5 pb-4">
            <button
              onClick={cancelRequest}
              disabled={busy}
              className="text-sm font-semibold text-[var(--text)] border border-[var(--border)] bg-[var(--panel)] px-4 py-2 rounded-lg hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition-colors disabled:opacity-50"
            >
              {busy ? "Cancelling…" : "Cancel Deletion Request"}
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  // ── Normal danger zone ────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Panel className="border-[var(--danger)]/30">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <p className="text-sm font-semibold text-[var(--danger)]">Danger Zone</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">Irreversible actions — proceed with caution</p>
        </div>
        <div className="divide-y divide-[var(--border)]/60">
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Export All Events</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">Download your full audit log via Forensics</p>
            </div>
            <Link href="/forensics" className="text-sm font-semibold text-[var(--accent)] hover:underline">Go to Forensics →</Link>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Delete Account</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">Suspend your account and request permanent deletion by staff</p>
            </div>
            <button
              onClick={() => { setStep("password"); setErr(null); }}
              className="text-sm font-semibold text-[var(--danger)] border border-[var(--danger)]/30 px-3 py-1.5 rounded-lg hover:bg-[var(--danger)]/10 transition-colors"
            >
              Delete…
            </button>
          </div>
        </div>
      </Panel>

      {/* Step 1 — password + reason */}
      {step === "password" && (
        <Panel>
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <p className="text-sm font-semibold text-[var(--text)]">Step 1 of 2 — Verify Identity</p>
            <p className="text-xs text-[var(--muted)] mt-0.5">Enter your password to confirm you authorise this request</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {err && <p className="text-xs text-[var(--danger)]">{err}</p>}
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                placeholder="Current password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-10`}
              />
              <button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showPw
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                  }
                </svg>
              </button>
            </div>
            <textarea
              placeholder="Reason for deletion (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { if (password.length > 0) { setStep("confirm"); setErr(null); } }}
                disabled={password.length === 0}
                className="flex-1 py-2 rounded-lg bg-[var(--danger)] text-white text-sm font-semibold hover:bg-[var(--danger)]/90 disabled:opacity-40 transition-colors"
              >
                Continue
              </button>
              <button onClick={() => { setStep("idle"); setPassword(""); setReason(""); setErr(null); }}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* Step 2 — final confirmation */}
      {step === "confirm" && (
        <Panel className="border-[var(--danger)]/40">
          <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--danger)]/5">
            <p className="text-sm font-semibold text-[var(--danger)]">Step 2 of 2 — Final Confirmation</p>
            <p className="text-xs text-[var(--muted)] mt-0.5">Your account will be suspended immediately. Staff will review and permanently delete your data.</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {err && <p className="text-xs text-[var(--danger)]">{err}</p>}
            <div className="bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-lg px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-[var(--danger)]">What happens next:</p>
              <ul className="text-xs text-[var(--muted)] space-y-0.5 list-disc list-inside">
                <li>Your account is suspended immediately</li>
                <li>All team members will lose access</li>
                <li>Staff will review and confirm deletion</li>
                <li>All data is permanently erased after approval</li>
                <li>This cannot be undone once staff approves</li>
              </ul>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)] mb-1.5">Type <strong>DELETE</strong> to confirm:</p>
              <input
                className={`${inputCls} ${confirmText.length > 0 && confirmText !== "DELETE" ? "border-[var(--danger)]/60" : ""}`}
                placeholder="DELETE"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={submitRequest}
                disabled={busy || confirmText !== "DELETE"}
                className="flex-1 py-2 rounded-lg bg-[var(--danger)] text-white text-sm font-semibold hover:bg-[var(--danger)]/90 disabled:opacity-40 transition-colors"
              >
                {busy ? "Submitting…" : "Submit Deletion Request"}
              </button>
              <button onClick={() => { setStep("idle"); setPassword(""); setReason(""); setConfirmText(""); setErr(null); }}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const ready = useRequireAuth();
  const session = getSession();
  const isAdmin = session?.role === "admin";

  const [sub, setSub] = useState<SubscriptionOut | null>(null);
  const [chain, setChain] = useState<ChainSummary | null>(null);
  const [profile, setProfile] = useState<TenantProfile | null>(null);

  useEffect(() => {
    if (!ready) return;
    getChainSummary().then(setChain).catch(() => null);
    getTenantSubscription().then(setSub).catch(() => null);
    getTenantProfile().then(setProfile).catch(() => null);
  }, [ready]);

  if (!ready) return null;

  const initials = (session?.username ?? "?").slice(0, 2).toUpperCase();
  const statusKey = sub?.paddle_subscription_status ?? "trialing";
  const statusCls = STATUS_COLOR[statusKey] ?? "text-[var(--muted)] bg-[var(--surface)] border-[var(--border)]";

  return (
    <NavBar>
      <main className="p-6 md:p-10 flex-1 max-w-2xl space-y-10">

        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Settings</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Account, workspace, security, and preferences.</p>
        </div>

        {/* Account */}
        <section>
          <SectionHeader title="Account" />
          <Panel>
            <div className="p-5 flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/15 flex items-center justify-center shrink-0">
                <span className="text-xl font-bold text-[var(--accent)]">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-[var(--text)]">{session?.username}</p>
                <p className="text-sm text-[var(--muted)]">
                  {sub?.tenant_name ?? "—"}
                  {sub?.tenant_name && session?.role ? " · " : ""}
                  {fmtRole(session?.role ?? "")}
                </p>
              </div>
              <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                { admin: "text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/20",
                  investigator: "text-[var(--safe)] bg-[var(--safe)]/10 border-[var(--safe)]/20",
                }[session?.role ?? ""] ?? "text-[var(--muted)] bg-[var(--surface)] border-[var(--border)]"
              }`}>
                {fmtRole(session?.role ?? "—")}
              </span>
            </div>
          </Panel>
        </section>

        {/* Company Profile — admin only */}
        {isAdmin && (
          <section>
            <SectionHeader title="Company Profile" subtitle="Visible to THE EYE team for support and compliance purposes." />
            <CompanyProfileSection />
          </section>
        )}

        {/* Security */}
        <section>
          <SectionHeader title="Security" subtitle="Change your password and manage sessions." />
          <SecuritySection />
        </section>

        {/* Appearance */}
        <section>
          <SectionHeader title="Appearance" subtitle="Choose how THE EYE looks on this device." />
          <AppearanceSection />
        </section>

        {/* Notifications */}
        <section>
          <SectionHeader title="Notifications" subtitle="Control what emails THE EYE sends you." />
          <NotificationsSection />
        </section>

        {/* Organization */}
        <section>
          <SectionHeader title="Organization" subtitle="Your workspace and subscription details." />
          <Panel>
            <div className="divide-y divide-[var(--border)]/60">
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-0.5">Workspace</p>
                  <p className="text-sm font-semibold text-[var(--text)]">{sub?.tenant_name ?? "—"}</p>
                </div>
              </div>
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-0.5">Current Plan</p>
                  <p className="text-sm font-semibold text-[var(--text)]">{sub?.plan?.name ?? "No plan"}</p>
                </div>
                <div className="flex items-center gap-3">
                  {sub && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${statusCls}`}>
                      {statusKey.replace(/_/g, " ")}
                    </span>
                  )}
                  <Link href="/billing" className="text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors">
                    Manage →
                  </Link>
                </div>
              </div>
              {sub?.plan?.limits && (
                <div className="px-5 py-4">
                  <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-3">Plan Limits</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Users",          value: sub.plan.limits.users ?? "Unlimited" },
                      { label: "API Keys",        value: sub.plan.limits.api_keys ?? "Unlimited" },
                      { label: "Events / month",  value: sub.plan.limits.events_per_month != null ? (sub.plan.limits.events_per_month as number / 1000).toFixed(0) + "k" : "Unlimited" },
                      { label: "Retention",       value: sub.plan.limits.retention_days != null ? `${sub.plan.limits.retention_days} days` : "Custom" },
                    ].map((item) => (
                      <div key={item.label} className="bg-[var(--surface)] rounded-xl px-3 py-2.5">
                        <p className="text-xs text-[var(--muted)]">{item.label}</p>
                        <p className="text-sm font-bold text-[var(--text)] font-mono mt-0.5">{String(item.value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isAdmin && (
                <div className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-0.5">Agent API Keys</p>
                    <p className="text-sm text-[var(--muted)]">Manage keys used to connect THE EYE Agent</p>
                  </div>
                  <Link href="/admin/api-keys" className="text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors">
                    View →
                  </Link>
                </div>
              )}
            </div>
          </Panel>
        </section>

        {/* Audit Ledger */}
        <section>
          <SectionHeader title="Audit Ledger" subtitle="Your tamper-evident event log status." />
          <Panel>
            <div className="divide-y divide-[var(--border)]/60">
              {chain ? (
                <>
                  <div className="px-5 py-4 flex items-center justify-between">
                    <p className="text-sm text-[var(--muted)]">Events recorded</p>
                    <p className="text-sm font-bold font-mono text-[var(--text)]">{chain.total_events.toLocaleString()}</p>
                  </div>
                  <div className="px-5 py-4 flex items-center justify-between">
                    <p className="text-sm text-[var(--muted)]">Last activity</p>
                    <p className="text-sm font-semibold text-[var(--text)]">{timeAgo(chain.last_event_at)}</p>
                  </div>
                  <div className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--muted)]">Chain integrity</p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">Every event is cryptographically linked</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--safe)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Verified
                      </span>
                      <Link href="/chain" className="text-xs text-[var(--accent)] hover:underline">View →</Link>
                    </div>
                  </div>
                </>
              ) : (
                <div className="px-5 py-6 text-center text-sm text-[var(--muted)]">Loading ledger status…</div>
              )}
            </div>
          </Panel>
        </section>

        {/* Team */}
        {isAdmin && (
          <section>
            <TeamPanel isAdmin={isAdmin} />
          </section>
        )}

        {/* Support */}
        <section>
          <SectionHeader title="Support" />
          <Panel>
            <div className="divide-y divide-[var(--border)]/60">
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Contact Support</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">Questions about your account or subscription</p>
                </div>
                <a href="mailto:support@theeye.com" className="text-sm font-semibold text-[var(--accent)] hover:underline">Email →</a>
              </div>
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Billing Queries</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">Invoices, receipts, plan changes</p>
                </div>
                <a href="mailto:billing@theeye.com" className="text-sm font-semibold text-[var(--accent)] hover:underline">Email →</a>
              </div>
            </div>
          </Panel>
        </section>

        {/* Danger Zone — admin only */}
        {isAdmin && (
          <section>
            <SectionHeader title="Danger Zone" />
            <DangerZone profile={profile} />
          </section>
        )}

      </main>
    </NavBar>
  );
}
