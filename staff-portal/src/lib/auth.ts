export interface StaffSession {
  username: string;
  role: string;
}

const KEY = "the_eye_staff_session";

export function getSession(): StaffSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StaffSession) : null;
  } catch {
    return null;
  }
}

export function setSession(s: StaffSession): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

export function isLoggedIn(): boolean {
  const s = getSession();
  return s !== null && s.role === "super_admin";
}
