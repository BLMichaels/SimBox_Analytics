export type EventType = "case_started" | "case_completed" | "case_exited" | "case_checkpoint";
export type DeliveryContext = "github_direct" | "wix_embedded" | "unknown";
export type DeviceType = "desktop" | "tablet" | "mobile" | "unknown";

export type CaseRecord = {
  id: string;
  case_key: string;
  display_name: string;
  active: boolean;
  app_version: string | null;
  created_at: string;
  updated_at: string;
};

export type CaseEventRecord = {
  id: string;
  created_at: string;
  occurred_at: string;
  event_type: EventType;
  case_id: string;
  session_id: string;
  event_key: string;
  elapsed_seconds: number | null;
  delivery_context: DeliveryContext | null;
  device_type: DeviceType | null;
  app_version: string | null;
  metadata: Record<string, unknown>;
  cases?: {
    case_key: string;
    display_name: string;
    active: boolean;
  } | null;
};

export type CaseSummary = {
  case_id: string;
  case_key: string;
  display_name: string;
  active: boolean;
  app_version: string | null;
  total_starts: number;
  total_completions: number;
  total_exits: number;
  completion_rate: number;
  avg_completion_seconds: number | null;
  median_completion_seconds: number | null;
  unique_anonymous_sessions: number;
};

export type DashboardMetrics = {
  kpis: {
    starts: number;
    completions: number;
    exits: number;
    unique_sessions: number;
    active_cases: number;
    avg_completion_seconds: number | null;
    median_completion_seconds: number | null;
  };
  daily: Array<{ day_utc: string; starts: number; completions: number }>;
  by_case: Array<{
    id: string;
    case_key: string;
    display_name: string;
    starts: number;
    completions: number;
    completion_rate: number;
  }>;
  by_delivery: Array<{ key: string; n: number }>;
  by_device: Array<{ key: string; n: number }>;
  by_step: Array<{ step: number; label: string; sessions: number }>;
};

export type DatePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "previousMonth"
  | "custom";

export type Filters = {
  preset: DatePreset;
  from: Date;
  to: Date;
  caseIds: string[];
  eventTypes: EventType[];
  deliveryContexts: DeliveryContext[];
  deviceTypes: DeviceType[];
  search: string;
  includeNonProduction: boolean;
  /** Minimum session length in seconds; 0 = no minimum. */
  minSessionSeconds: number;
};
