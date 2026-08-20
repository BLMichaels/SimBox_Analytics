import type { Filters } from "./types";

const KEY = "simbox.savedFilters.v1";

export type SavedPreset = {
  id: string;
  name: string;
  createdAt: string;
  filters: Omit<Filters, "from" | "to"> & { from: string; to: string };
};

export function loadPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePreset(name: string, filters: Filters): SavedPreset[] {
  const next: SavedPreset = {
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled view",
    createdAt: new Date().toISOString(),
    filters: {
      ...filters,
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
    },
  };
  const all = [next, ...loadPresets()].slice(0, 24);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
  return all;
}

export function deletePreset(id: string): SavedPreset[] {
  const all = loadPresets().filter((p) => p.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
  return all;
}

export function presetToFilters(preset: SavedPreset): Filters {
  return {
    ...preset.filters,
    from: new Date(preset.filters.from),
    to: new Date(preset.filters.to),
  };
}

export function describeFilters(filters: Filters, cases: Array<{ id: string; display_name: string }>): string[] {
  const chips: string[] = [];
  if (filters.minSessionSeconds > 0) chips.push(`≥${Math.round(filters.minSessionSeconds / 60)} min`);
  if (filters.caseIds.length) {
    const names = filters.caseIds
      .map((id) => cases.find((c) => c.id === id)?.display_name ?? id)
      .slice(0, 3);
    chips.push(names.join(", ") + (filters.caseIds.length > 3 ? "…" : ""));
  }
  if (filters.deliveryContexts.length) chips.push(filters.deliveryContexts.join(", "));
  if (filters.deviceTypes.length) chips.push(filters.deviceTypes.join(", "));
  if (filters.eventTypes.length) chips.push(filters.eventTypes.map((t) => t.replace("case_", "")).join(", "));
  if (filters.search.trim()) chips.push(`Search: ${filters.search.trim()}`);
  if (!filters.includeNonProduction) chips.push("Production only");
  return chips;
}
