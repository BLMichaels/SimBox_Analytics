import {
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import type { DatePreset } from "./types";

export function rangeForPreset(preset: DatePreset, customFrom?: Date, customTo?: Date): {
  from: Date;
  to: Date;
} {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last7":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "last30":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "previousMonth": {
      const prev = subMonths(now, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case "custom":
      return {
        from: customFrom ? startOfDay(customFrom) : startOfDay(subDays(now, 29)),
        to: customTo ? endOfDay(customTo) : endOfDay(now),
      };
  }
}

export function formatLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatLocalPrecise(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

export function formatRange(from: Date, to: Date): string {
  const fmt = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  return `${fmt.format(from)} – ${fmt.format(to)}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return "—";
  return `${Math.round(rate * 1000) / 10}%`;
}

export function shortSession(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function isoDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The equal-length window immediately before `from`. */
export function previousPeriod(from: Date, to: Date): { from: Date; to: Date } {
  const span = Math.max(1, to.getTime() - from.getTime());
  return { from: new Date(from.getTime() - span), to: new Date(from.getTime() - 1) };
}
