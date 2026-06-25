export type EventCategory =
  | "authentication"
  | "authorization"
  | "data_access"
  | "data_modification"
  | "configuration"
  | "process_execution"
  | "network"
  | "financial_transaction"
  | "administrative"
  | "system";

export type EventOutcome = "success" | "failure" | "denied" | "unknown";

export interface EventRead {
  id: string;
  sequence_num: number;
  tenant_id: string;
  source_id: string;
  actor_type: string;
  actor_id: string;
  actor_display_name: string | null;
  event_type: string;
  event_category: EventCategory;
  outcome: EventOutcome;
  severity: string;
  origin_host: string | null;
  origin_ip: string | null;
  origin_application: string | null;
  occurred_at: string;
  received_at: string;
  target_type: string | null;
  target_id: string | null;
  change_summary: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  prev_hash: string;
  record_hash: string;
}

export interface EventSearchParams {
  actor_id?: string;
  event_type?: string;
  event_category?: string;
  outcome?: string;
  q?: string;
  limit?: number;
  offset?: number;
}
