"use client";

import { useEffect, useState } from "react";
import { applyTheme, initialTheme, Theme } from "@/lib/theme";

export default function ThemeToggle() {
  // Starts null on both server and client (no flash-causing mismatch -- the
  // inline script in layout.tsx already set the real class on <html> before
  // hydration; this just needs to know what to *display* on the button,
  // which can lag one tick behind without anyone noticing).
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflecting already-applied DOM/localStorage state into the toggle's own label, not a data fetch
    setTheme(initialTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      className="text-muted hover:text-accent hover:bg-surface rounded-lg p-2 transition-colors"
      title="Toggle light/dark theme"
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  );
}
