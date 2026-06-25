import { EventRead, EventSearchParams } from "@/types/event";
import { clearSession, Session } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  // credentials: "include" sends the httpOnly session cookie automatically --
  // there is no token in JS to attach as an Authorization header anymore.
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });

  if (res.status === 401) {
    clearSession();
  }
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function login(username: string, password: string): Promise<Session> {
  return request<Session>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(): Promise<void> {
  await request<void>("/v1/auth/logout", { method: "POST" });
}

export async function searchEvents(params: EventSearchParams): Promise<EventRead[]> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  return request<EventRead[]>(`/v1/events?${query.toString()}`);
}

export async function getEvent(id: string): Promise<EventRead> {
  return request<EventRead>(`/v1/events/${id}`);
}

export interface UserRead {
  id: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export async function listUsers(): Promise<UserRead[]> {
  return request<UserRead[]>("/v1/users");
}

export async function createUser(username: string, password: string, role: string): Promise<UserRead> {
  return request<UserRead>("/v1/users", {
    method: "POST",
    body: JSON.stringify({ username, password, role }),
  });
}

export async function deactivateUser(id: string): Promise<UserRead> {
  return request<UserRead>(`/v1/users/${id}/deactivate`, { method: "POST" });
}

export interface SourceRead {
  id: string;
  name: string;
  source_kind: string;
  api_key_prefix: string;
  is_active: boolean;
  created_at: string;
  last_seen_at: string | null;
}

export async function listSources(): Promise<SourceRead[]> {
  return request<SourceRead[]>("/v1/sources");
}

export interface OverviewStats {
  events_today: number;
  critical_flags: number;
  active_sources: number;
  high_risk_users: number;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  return request<OverviewStats>("/v1/stats/overview");
}

export interface ActorRiskScore {
  actor_id: string;
  risk_score: number;
  total_events: number;
  failed_count: number;
  critical_count: number;
  admin_count: number;
  financial_count: number;
  last_seen_at: string | null;
}

export async function getActorRiskScores(): Promise<ActorRiskScore[]> {
  return request<ActorRiskScore[]>("/v1/risk/actors");
}

export interface AlertRead {
  key: string;
  rule_id: string;
  rule_name: string;
  severity: string;
  actor_id: string;
  message: string;
  detected_at: string;
  status: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

export async function listAlerts(): Promise<AlertRead[]> {
  return request<AlertRead[]>("/v1/alerts");
}

export async function actOnAlert(
  key: string,
  ruleId: string,
  actorId: string,
  action: "acknowledged" | "escalated"
): Promise<void> {
  await request(`/v1/alerts/${key}/action`, {
    method: "POST",
    body: JSON.stringify({ rule_id: ruleId, actor_id: actorId, action }),
  });
}

export interface ChainVerifyResult {
  ok: boolean;
  records_checked: number;
  divergences: { sequence_num: number; field: string; expected: string; actual: string }[];
}

export async function verifyChain(): Promise<ChainVerifyResult> {
  return request<ChainVerifyResult>("/v1/chain/verify");
}

export interface NetworkNode {
  id: string;
  kind: "actor" | "target";
  label: string;
}
export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
}
export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export async function getForensicsNetwork(): Promise<NetworkGraph> {
  return request<NetworkGraph>("/v1/forensics/network");
}

export async function downloadEventsExport(params: EventSearchParams, format: "csv" | "json"): Promise<void> {
  // Fetch + blob (rather than a plain <a href>) so we get a typed ApiError on
  // failure instead of silently navigating; the httpOnly cookie is attached
  // automatically via credentials: "include".
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  query.set("format", format);

  const res = await fetch(`${API_BASE}/v1/events/export?${query.toString()}`, { credentials: "include" });
  if (!res.ok) throw new ApiError(res.status, await res.text());

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `the-eye-evidence-export.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface DeletionApprovalRead {
  approver_role: string;
  decision: string;
  decided_at: string;
}
export interface DeletionRequestRead {
  id: string;
  requested_by: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  created_at: string;
  approvals: DeletionApprovalRead[];
}

export async function listDeletionRequests(): Promise<DeletionRequestRead[]> {
  return request<DeletionRequestRead[]>("/v1/deletion-requests");
}

export async function createDeletionRequest(
  targetType: "user" | "ingestion_source",
  targetId: string,
  reason: string
): Promise<DeletionRequestRead> {
  return request<DeletionRequestRead>("/v1/deletion-requests", {
    method: "POST",
    body: JSON.stringify({ target_type: targetType, target_id: targetId, reason }),
  });
}

export interface InvestigateResponse {
  filters_used: Record<string, unknown>;
  matched_count: number;
  report_text: string;
  events: EventRead[];
}

export async function investigate(question: string): Promise<InvestigateResponse> {
  return request<InvestigateResponse>("/v1/investigate", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export interface IntrusionAttempt {
  ip: string | null;
  country: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  event_type: string;
  occurred_at: string;
}
export interface IntrusionStats {
  total_attempts: number;
  countries: { country: string; count: number }[];
  attempts: IntrusionAttempt[];
}

export async function getIntrusionStats(): Promise<IntrusionStats> {
  return request<IntrusionStats>("/v1/intrusion/stats");
}

export async function submitWhistleblowerReport(report: string, category: string): Promise<void> {
  // Deliberately bypasses the shared `request()` helper and omits credentials:
  // an anonymous public submission must never carry the logged-in admin's
  // session cookie.
  const res = await fetch(`${API_BASE}/v1/whistleblower`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report, category }),
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
}

export interface WhistleblowerReportRead {
  id: string;
  category: string;
  report_text: string;
  created_at: string;
}

export async function getWhistleblowerReport(reportId: string): Promise<WhistleblowerReportRead> {
  return request<WhistleblowerReportRead>(`/v1/whistleblower/reports/${reportId}`);
}

export async function decideDeletionRequest(
  id: string,
  decision: "approve" | "reject"
): Promise<DeletionRequestRead> {
  return request<DeletionRequestRead>(`/v1/deletion-requests/${id}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}
