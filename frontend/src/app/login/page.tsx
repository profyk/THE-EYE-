"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login as loginRequest } from "@/lib/api-client";
import { isLoggedIn, setSession } from "@/lib/auth";
import Panel from "@/components/Panel";
import Button from "@/components/Button";
import EyeLogo from "@/components/EyeLogo";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) {
      router.replace("/overview");
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await loginRequest(username, password);
      setSession(session);
      router.replace("/overview");
    } catch {
      setError("Invalid username or password.");
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
            <EyeLogo size={44} />
            <p className="font-mono font-extrabold text-lg tracking-[3px] text-accent">THE EYE</p>
            <p className="text-[9px] tracking-[2px] text-muted uppercase -mt-1">Intelligence &amp; Accountability Platform</p>
            <p className="text-sm text-muted mt-1">Sign in with your account.</p>
          </div>
          <input
            type="text"
            autoFocus
            className={inputClass}
            placeholder="Username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            className={inputClass}
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={loading || !username || !password} className="w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
