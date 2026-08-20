import { applyClientFilters, fetchCaseEvents, type EventFetchResult } from "./fetchEvents";
import {
  filterSessionsByMinDuration,
  metricsFromSessions,
  summarizeSessions,
  type SessionSummary,
} from "./reporting";
import type { DashboardMetrics, Filters } from "./types";

export type StudyExtract = {
  error: string | null;
  truncated: boolean;
  fetched: number;
  total: number | null;
  rawSessions: SessionSummary[];
  sessions: SessionSummary[];
  metrics: DashboardMetrics;
};

function emptyMetrics(): DashboardMetrics {
  return {
    kpis: {
      starts: 0,
      completions: 0,
      exits: 0,
      unique_sessions: 0,
      active_cases: 0,
      avg_completion_seconds: null,
      median_completion_seconds: null,
    },
    daily: [],
    by_case: [],
    by_delivery: [],
    by_device: [],
    by_step: [],
  };
}

export function emptyExtract(): StudyExtract {
  return {
    error: null,
    truncated: false,
    fetched: 0,
    total: 0,
    rawSessions: [],
    sessions: [],
    metrics: emptyMetrics(),
  };
}

export async function loadStudyExtract(opts: {
  from: Date;
  to: Date;
  filters: Filters;
  caseIds?: string[];
}): Promise<StudyExtract> {
  const fetched: EventFetchResult = await fetchCaseEvents({
    from: opts.from,
    to: opts.to,
    caseIds: opts.caseIds ?? opts.filters.caseIds,
    eventTypes: opts.filters.eventTypes,
    deliveryContexts: opts.filters.deliveryContexts,
    deviceTypes: opts.filters.deviceTypes,
  });
  if (fetched.error) {
    return { ...emptyExtract(), error: fetched.error, total: fetched.total };
  }
  const rows = applyClientFilters(fetched.rows, {
    includeNonProduction: opts.filters.includeNonProduction,
    search: opts.filters.search,
  });
  const rawSessions = summarizeSessions(rows);
  const sessions = filterSessionsByMinDuration(rawSessions, opts.filters.minSessionSeconds);
  return {
    error: null,
    truncated: fetched.truncated,
    fetched: fetched.fetched,
    total: fetched.total,
    rawSessions,
    sessions,
    metrics: metricsFromSessions(sessions),
  };
}
