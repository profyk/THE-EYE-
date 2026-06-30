"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearSession, isLoggedIn, setSession } from "@/lib/auth";
import { verifySession } from "@/lib/api-client";

export function useRequireAuth(): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    // Verify the httpOnly cookie is still valid — localStorage can be stale
    // if the session expired or the browser cleared the cookie.
    verifySession()
      .then((session) => {
        setSession(session);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setReady(true);
      })
      .catch(() => {
        clearSession();
        router.replace("/login");
      });
  }, [router]);

  return ready;
}
