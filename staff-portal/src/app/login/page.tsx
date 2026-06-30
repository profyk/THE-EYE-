"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login as loginRequest, ApiError, API_BASE } from "@/lib/api-client";
import { isLoggedIn, setSession } from "@/lib/auth";
import Panel from "@/components/Panel";

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
        setError("Invalid username or password.");
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
    "w-full bg-surface border border-border text-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors";

  return (
    <div className="flex flex-1 min-h-screen items-center justify-center bg-void">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[11px] tracking-[4px] text-accent font-bold uppercase">THE EYE</p>
          <p className="text-[9px] tracking-[3px] text-muted uppercase mt-1">Command Centre — Staff Access</p>
        </div>

        <Panel className="p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">Username</label>
              <input
                type="text"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
                >
                  {showPw ? (
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

            {error && (
              <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full bg-accent hover:bg-accent-dim disabled:opacity-40 disabled:cursor-not-allowed text-void font-bold py-2.5 rounded-lg text-sm transition-colors mt-2"
            >
              {loading ? "Authenticating…" : "Sign In"}
            </button>
          </form>
        </Panel>

        <p className="text-center text-[10px] text-muted mt-6 tracking-wide">
          Authorised personnel only. All access is logged.
        </p>
      </div>
    </div>
  );
}
