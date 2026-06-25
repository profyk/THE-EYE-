"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";

export function useRequireAuth(): boolean {
  const router = useRouter();
  // Must start false on both server and client renders -- a lazy initializer
  // that reads localStorage would render differently during SSR (no window)
  // vs. client hydration, causing a hydration mismatch. Setting it after mount
  // in the effect is correct here even though it's a setState-in-effect: this
  // is an auth gate, not a data fetch, so there's no other way to derive it.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
    }
  }, [router]);

  return ready;
}
