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

// ── Staff admin management ────────────────────────────────────────────────────

export interface StaffAdmin {
  id: string;
  username: string;
  is_active: boolean;
  created_at: string;
}

export async function listStaffAdmins(): Promise<StaffAdmin[]> {
  return request<StaffAdmin[]>("/v1/staff/admins");
}

export async function createStaffAdmin(username: string, password: string): Promise<StaffAdmin> {
  return request<StaffAdmin>("/v1/staff/admins", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function suspendStaffAdmin(id: string): Promise<StaffAdmin> {
  return request<StaffAdmin>(`/v1/staff/admins/${id}/suspend`, { method: "POST" });
}

export async function activateStaffAdmin(id: string): Promise<StaffAdmin> {
  return request<StaffAdmin>(`/v1/staff/admins/${id}/activate`, { method: "POST" });
}

export async function deleteStaffAdmin(id: string): Promise<void> {
  await request<void>(`/v1/staff/admins/${id}`, { method: "DELETE" });
}

// ── Client user management ────────────────────────────────────────────────────

export async function suspendClientUser(id: string): Promise<UserWithTenant> {
  return request<UserWithTenant>(`/v1/staff/users/${id}/suspend`, { method: "POST" });
}

export async function activateClientUser(id: string): Promise<UserWithTenant> {
  return request<UserWithTenant>(`/v1/staff/users/${id}/activate`, { method: "POST" });
}

export async function resetClientUserPassword(id: string): Promise<{ temp_password: string }> {
  return request<{ temp_password: string }>(`/v1/staff/users/${id}/reset-password`, { method: "POST" });
}

// ── Platform API keys ─────────────────────────────────────────────────────────

export interface StaffApiKey {
  id: string;
  tenant_id: string;
  tenant_name: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  created_by_username: string | null;
}

export async function listAllApiKeys(): Promise<StaffApiKey[]> {
  return request<StaffApiKey[]>("/v1/staff/api-keys");
}

export async function revokeApiKey(id: string): Promise<void> {
  await request<void>(`/v1/staff/api-keys/${id}`, { method: "DELETE" });
}

// ── Revenue intelligence ──────────────────────────────────────────────────────

export interface RevenueStats {
  mrr: number;
  arr: number;
  paying_count: number;
  trialing_count: number;
  past_due_count: number;
  churned_count: number;
  growth_30d: number;
  monthly_trend: { month: string; count: number }[];
}

export async function getRevenueStats(): Promise<RevenueStats> {
  return request<RevenueStats>("/v1/staff/revenue");
}

// ── Tenant users ──────────────────────────────────────────────────────────────

export async function getTenantUsers(tenantId: string): Promise<UserWithTenant[]> {
  return request<UserWithTenant[]>(`/v1/staff/tenants/${tenantId}/users`);
}

// ── Support notes ─────────────────────────────────────────────────────────────

export interface StaffNote {
  id: string;
  tenant_id: string;
  author_username: string;
  body: string;
  created_at: string;
}

export async function getTenantNotes(tenantId: string): Promise<StaffNote[]> {
  return request<StaffNote[]>(`/v1/staff/tenants/${tenantId}/notes`);
}

export async function addTenantNote(tenantId: string, body: string): Promise<StaffNote> {
  return request<StaffNote>(`/v1/staff/tenants/${tenantId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function deleteTenantNote(tenantId: string, noteId: string): Promise<void> {
  await request<void>(`/v1/staff/tenants/${tenantId}/notes/${noteId}`, { method: "DELETE" });
}

// ── Announcements ─────────────────────────────────────────────────────────────

export interface StaffAnnouncement {
  id: string;
  title: string;
  body: string;
  severity: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export async function listAnnouncements(): Promise<StaffAnnouncement[]> {
  return request<StaffAnnouncement[]>("/v1/staff/announcements");
}

export async function createAnnouncement(title: string, body: string, severity: string): Promise<StaffAnnouncement> {
  return request<StaffAnnouncement>("/v1/staff/announcements", {
    method: "POST",
    body: JSON.stringify({ title, body, severity }),
  });
}

export async function toggleAnnouncement(id: string, is_active: boolean): Promise<StaffAnnouncement> {
  return request<StaffAnnouncement>(`/v1/staff/announcements/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active }),
  });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await request<void>(`/v1/staff/announcements/${id}`, { method: "DELETE" });
}

// ── Tenant deletion queue ─────────────────────────────────────────────────────

export interface DeletionQueueItem {
  id: string;
  name: string;
  slug: string;
  deletion_requested_at: string;
  deletion_reason: string | null;
  scheduled_deletion_at: string | null;
  user_count: number;
  contact_email: string | null;
}

export async function getDeletionQueue(): Promise<DeletionQueueItem[]> {
  return request<DeletionQueueItem[]>("/v1/staff/deletion-queue");
}

export async function approveTenantDeletion(
  tenantId: string,
  password: string,
  reason: string,
  scheduledAt?: string,
): Promise<{ action: string; scheduled_at?: string }> {
  return request(`/v1/staff/deletion-queue/${tenantId}/approve`, {
    method: "POST",
    body: JSON.stringify({ password, reason, scheduled_at: scheduledAt ?? null }),
  });
}

export async function rejectTenantDeletion(
  tenantId: string,
  password: string,
  reason: string,
): Promise<void> {
  await request<void>(`/v1/staff/deletion-queue/${tenantId}/reject`, {
    method: "POST",
    body: JSON.stringify({ password, reason }),
  });
}

export async function executeScheduledDeletion(
  tenantId: string,
  password: string,
  reason: string,
): Promise<void> {
  await request<void>(`/v1/staff/deletion-queue/${tenantId}/execute`, {
    method: "POST",
    body: JSON.stringify({ password, reason }),
  });
}

// ── Staff audit log ───────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  occurred_at: string;
  actor_username: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  reason: string | null;
  severity: "info" | "warning" | "critical";
  details: Record<string, unknown> | null;
}

export interface AuditLogStats {
  total: number;
  critical: number;
  warning: number;
  info: number;
  last_24h: number;
  actions_breakdown: { action: string; count: number }[];
}

export async function getAuditLog(params?: {
  limit?: number;
  offset?: number;
  severity?: string;
  action?: string;
  actor?: string;
}): Promise<AuditLogEntry[]> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.severity) qs.set("severity", params.severity);
  if (params?.action) qs.set("action", params.action);
  if (params?.actor) qs.set("actor", params.actor);
  const query = qs.toString() ? `?${qs}` : "";
  return request<AuditLogEntry[]>(`/v1/staff/audit-log${query}`);
}

export async function getAuditLogStats(): Promise<AuditLogStats> {
  return request<AuditLogStats>("/v1/staff/audit-log/stats");
}
