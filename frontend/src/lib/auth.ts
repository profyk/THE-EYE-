const SESSION_KEY = "the_eye_session";

// The real auth boundary is an httpOnly session cookie set by the backend on
// login -- it's never readable by JS, so it can't be stolen via XSS the way
// a localStorage token could. What's stored here is just a non-secret marker
// (username/role) for synchronous client-side UI state (nav visibility,
// useRequireAuth's redirect gate); every actual API call is authorized
// server-side via the cookie the browser attaches automatically.

export interface Session {
  username: string;
  role: string;
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
}

export function isLoggedIn(): boolean {
  return getSession() !== null;
}

export function hasRole(...roles: string[]): boolean {
  const session = getSession();
  return session !== null && roles.includes(session.role);
}
