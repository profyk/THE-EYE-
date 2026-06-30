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

export interface BillingOverview {
  total_tenants: number;
  paying: number;
  trialing: number;
  past_due: number;
  cancelled: number;
  other: number;
  status_breakdown: { status: string; count: number }[];
}

export async function getBillingOverview(): Promise<BillingOverview> {
  return request<BillingOverview>("/v1/staff/billing");
}

export interface PlatformAnalytics {
  events_by_day: { date: string; count: number }[];
  events_by_severity: { severity: string; count: number }[];
  events_by_category: { category: string; count: number }[];
  top_tenants: { tenant_id: string; tenant_name: string; count: number }[];
}

export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  return request<PlatformAnalytics>("/v1/staff/analytics");
}

// ── Plan management ───────────────────────────────────────────────────────────

export interface StaffPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number | null;
  price_annual: number | null;
  currency: string;
  paddle_price_id_monthly: string | null;
  paddle_price_id_annual: string | null;
  features: string[] | null;
  limits: Record<string, number | null> | null;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  tenant_count: number;
}

export interface PlanCreatePayload {
  name: string;
  slug: string;
  description?: string;
  price_monthly?: number;
  price_annual?: number;
  currency?: string;
  paddle_price_id_monthly?: string;
  paddle_price_id_annual?: string;
  features?: string[];
  limits?: Record<string, number | null>;
  is_public?: boolean;
  sort_order?: number;
}

export async function staffListPlans(): Promise<StaffPlan[]> {
  return request<StaffPlan[]>("/v1/staff/plans");
}

export async function staffCreatePlan(data: PlanCreatePayload): Promise<StaffPlan> {
  return request<StaffPlan>("/v1/staff/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function staffUpdatePlan(
  id: string,
  data: Partial<PlanCreatePayload> & { is_active?: boolean },
): Promise<StaffPlan> {
  return request<StaffPlan>(`/v1/staff/plans/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function staffAssignPlan(
  tenantId: string,
  planId: string | null,
  subscriptionStatus?: string,
): Promise<void> {
  await request<void>(`/v1/staff/tenants/${tenantId}/assign-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_id: planId, paddle_subscription_status: subscriptionStatus }),
  });
}
