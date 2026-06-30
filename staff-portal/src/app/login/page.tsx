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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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
                className="w-full bg-surface border border-border text-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface border border-border text-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors"
              />
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
