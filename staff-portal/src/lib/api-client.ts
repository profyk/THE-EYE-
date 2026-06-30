import { clearSession } from "@/lib/auth";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers as Record<string, string>) },
    credentials: "include",
  });
  if (res.status === 401) clearSession();
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface Session { username: string; role: string; }

export async function login(username: string, password: string): Promise<Session> {
  return request<Session>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(): Promise<void> {
  await request<void>("/v1/auth/logout", { method: "POST" });
}

export interface PlatformOverview {
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  total_users: number;
  total_events_30d: number;
  new_tenants_30d: number;
}

export async function getOverview(): Promise<PlatformOverview> {
  return request<PlatformOverview>("/v1/staff/overview");
}

export interface TenantStats {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  paddle_subscription_status: string | null;
  user_count: number;
  event_count_30d: number;
  last_event_at: string | null;
}

export async function listTenants(): Promise<TenantStats[]> {
  return request<TenantStats[]>("/v1/staff/tenants");
}

export async function getTenant(id: string): Promise<TenantStats> {
  return request<TenantStats>(`/v1/staff/tenants/${id}`);
}

export async function suspendTenant(id: string): Promise<TenantStats> {
  return request<TenantStats>(`/v1/staff/tenants/${id}/suspend`, { method: "POST" });
}

export async function activateTenant(id: string): Promise<TenantStats> {
  return request<TenantStats>(`/v1/staff/tenants/${id}/activate`, { method: "POST" });
}

export interface UserWithTenant {
  id: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  tenant_id: string | null;
  tenant_name: string | null;
}

export async function listAllUsers(): Promise<UserWithTenant[]> {
  return request<UserWithTenant[]>("/v1/staff/users");
}
