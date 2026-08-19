/**
 * Shared anonymous event payload validation.
 * Used by the Edge Function and by unit tests.
 * Keep this file free of Deno/Node-only APIs so both runtimes can import it.
 */

export const EVENT_TYPES = [
  "case_started",
  "case_completed",
  "case_exited",
  "case_checkpoint",
] as const;

export const DELIVERY_CONTEXTS = [
  "github_direct",
  "wix_embedded",
  "unknown",
] as const;

export const DEVICE_TYPES = [
  "desktop",
  "tablet",
  "mobile",
  "unknown",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type DeliveryContext = (typeof DELIVERY_CONTEXTS)[number];
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const MAX_PAYLOAD_BYTES = 8_192;
export const MAX_STRING = 128;
export const MAX_EVENT_KEY = 180;
export const MAX_SESSION_ID = 80;
export const MAX_CASE_KEY = 80;
export const MAX_APP_VERSION = 32;
export const MIN_ELAPSED = 0;
export const MAX_ELAPSED_SECONDS = 43_200; // 12 hours
export const MAX_METADATA_KEYS = 24;
export const MAX_METADATA_STRING = 64;

export type SimBoxEventPayload = {
  event_type: EventType;
  case_key: string;
  session_id: string;
  event_key: string;
  occurred_at: string;
  elapsed_seconds: number | null;
  delivery_context: DeliveryContext | null;
  device_type: DeviceType | null;
  app_version: string | null;
  metadata: Record<string, unknown>;
};

export type ValidationResult =
  | { ok: true; value: SimBoxEventPayload }
  | { ok: false; error: string; status: number };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function includes<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

function isIsoUtc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) {
    return false;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return false;
  const skewMs = 10 * 60 * 1000;
  const now = Date.now();
  if (ms > now + skewMs) return false;
  if (ms < now - 30 * 24 * 60 * 60 * 1000) return false;
  return true;
}

function sanitizeMetadata(
  raw: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: {} };
  if (!isObject(raw)) return { ok: false, error: "metadata must be an object" };
  const keys = Object.keys(raw);
  if (keys.length > MAX_METADATA_KEYS) {
    return { ok: false, error: "metadata has too many keys" };
  }
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key.length > 40 || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      return { ok: false, error: "metadata keys are invalid" };
    }
    const blocked = [
      "name",
      "email",
      "user",
      "ip",
      "user_agent",
      "useragent",
      "fingerprint",
      "phi",
      "patient",
      "free_text",
      "response",
    ];
    if (blocked.includes(key.toLowerCase())) {
      return { ok: false, error: "metadata contains a disallowed key" };
    }
    const val = raw[key];
    if (val === null || typeof val === "boolean" || typeof val === "number") {
      if (typeof val === "number" && !Number.isFinite(val)) {
        return { ok: false, error: "metadata numbers must be finite" };
      }
      out[key] = val;
      continue;
    }
    if (typeof val === "string") {
      if (val.length > MAX_METADATA_STRING) {
        return { ok: false, error: "metadata string too long" };
      }
      out[key] = val;
      continue;
    }
    return { ok: false, error: "metadata values must be scalar" };
  }
  return { ok: true, value: out };
}

export function validateEventPayload(
  raw: unknown,
  byteLength: number,
): ValidationResult {
  if (byteLength > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: "payload too large", status: 413 };
  }
  if (!isObject(raw)) {
    return { ok: false, error: "JSON object required", status: 400 };
  }

  const eventType = asString(raw.event_type);
  if (!eventType || !includes(EVENT_TYPES, eventType)) {
    return { ok: false, error: "invalid event_type", status: 400 };
  }

  const caseKey = asString(raw.case_key);
  if (!caseKey || caseKey.length > MAX_CASE_KEY || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(caseKey)) {
    return { ok: false, error: "invalid case_key", status: 400 };
  }

  const sessionId = asString(raw.session_id);
  if (!sessionId || sessionId.length > MAX_SESSION_ID || !/^[A-Za-z0-9._-]+$/.test(sessionId)) {
    return { ok: false, error: "invalid session_id", status: 400 };
  }

  const eventKey = asString(raw.event_key);
  if (!eventKey || eventKey.length > MAX_EVENT_KEY || !/^[A-Za-z0-9._:-]+$/.test(eventKey)) {
    return { ok: false, error: "invalid event_key", status: 400 };
  }

  const occurredAt = asString(raw.occurred_at);
  if (!occurredAt || !isIsoUtc(occurredAt)) {
    return { ok: false, error: "invalid occurred_at", status: 400 };
  }

  let elapsed: number | null = null;
  if (raw.elapsed_seconds !== undefined && raw.elapsed_seconds !== null) {
    if (typeof raw.elapsed_seconds !== "number" || !Number.isInteger(raw.elapsed_seconds)) {
      return { ok: false, error: "invalid elapsed_seconds", status: 400 };
    }
    if (raw.elapsed_seconds < MIN_ELAPSED || raw.elapsed_seconds > MAX_ELAPSED_SECONDS) {
      return { ok: false, error: "elapsed_seconds out of range", status: 400 };
    }
    elapsed = raw.elapsed_seconds;
  }

  let delivery: DeliveryContext | null = null;
  if (raw.delivery_context !== undefined && raw.delivery_context !== null) {
    const d = asString(raw.delivery_context);
    if (!d || !includes(DELIVERY_CONTEXTS, d)) {
      return { ok: false, error: "invalid delivery_context", status: 400 };
    }
    delivery = d;
  }

  let device: DeviceType | null = null;
  if (raw.device_type !== undefined && raw.device_type !== null) {
    const d = asString(raw.device_type);
    if (!d || !includes(DEVICE_TYPES, d)) {
      return { ok: false, error: "invalid device_type", status: 400 };
    }
    device = d;
  }

  let appVersion: string | null = null;
  if (raw.app_version !== undefined && raw.app_version !== null) {
    const v = asString(raw.app_version);
    if (!v || v.length > MAX_APP_VERSION || !/^[A-Za-z0-9._-]+$/.test(v)) {
      return { ok: false, error: "invalid app_version", status: 400 };
    }
    appVersion = v;
  }

  const meta = sanitizeMetadata(raw.metadata);
  if (!meta.ok) {
    return { ok: false, error: meta.error, status: 400 };
  }

  return {
    ok: true,
    value: {
      event_type: eventType,
      case_key: caseKey,
      session_id: sessionId,
      event_key: eventKey,
      occurred_at: occurredAt,
      elapsed_seconds: elapsed,
      delivery_context: delivery,
      device_type: device,
      app_version: appVersion,
      metadata: meta.value,
    },
  };
}
