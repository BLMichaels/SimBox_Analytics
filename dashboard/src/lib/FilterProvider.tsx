import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { rangeForPreset } from "./dates";
import { supabase } from "./supabase";
import type { CaseRecord, Filters } from "./types";

const STORAGE = "simbox.studyFilters.v2";

export const MIN_SESSION_PRESETS: Array<{ label: string; seconds: number }> = [
  { label: "Any length", seconds: 0 },
  { label: "2 min", seconds: 120 },
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
  { label: "15 min", seconds: 900 },
  { label: "20 min", seconds: 1200 },
];

export function defaultFilters(): Filters {
  const { from, to } = rangeForPreset("last30");
  return {
    preset: "last30",
    from,
    to,
    caseIds: [],
    eventTypes: [],
    deliveryContexts: [],
    deviceTypes: [],
    search: "",
    includeNonProduction: true,
    minSessionSeconds: 0,
  };
}

function readStored(): Filters {
  try {
    const raw = sessionStorage.getItem(STORAGE);
    if (!raw) return defaultFilters();
    const parsed = JSON.parse(raw) as Filters & { from: string; to: string };
    const base = {
      ...defaultFilters(),
      ...parsed,
      from: new Date(parsed.from),
      to: new Date(parsed.to),
      minSessionSeconds: typeof parsed.minSessionSeconds === "number" ? parsed.minSessionSeconds : 0,
    };
    if (base.preset !== "custom") {
      const { from, to } = rangeForPreset(base.preset);
      return { ...base, from, to };
    }
    return base;
  } catch {
    return defaultFilters();
  }
}

type StudyFilterContext = {
  filters: Filters;
  setFilters: (next: Filters) => void;
  bounds: { from: Date; to: Date };
  cases: CaseRecord[];
};

const Context = createContext<StudyFilterContext | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<Filters>(readStored);
  const [cases, setCases] = useState<CaseRecord[]>([]);

  useEffect(() => {
    void supabase
      .from("cases")
      .select("*")
      .order("display_name")
      .then(({ data }) => setCases((data ?? []) as CaseRecord[]));
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE,
        JSON.stringify({ ...filters, from: filters.from.toISOString(), to: filters.to.toISOString() }),
      );
    } catch {
      /* private mode */
    }
  }, [filters]);

  const bounds = useMemo(
    () => (filters.preset === "custom" ? { from: filters.from, to: filters.to } : rangeForPreset(filters.preset)),
    [filters.from, filters.preset, filters.to],
  );

  const setFilters = (next: Filters) => {
    if (next.preset !== "custom") {
      const range = rangeForPreset(next.preset);
      setFiltersState({ ...next, from: range.from, to: range.to });
      return;
    }
    setFiltersState(next);
  };

  return <Context.Provider value={{ filters, setFilters, bounds, cases }}>{children}</Context.Provider>;
}

export function useStudyFilters(): StudyFilterContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useStudyFilters must be used inside FilterProvider");
  return ctx;
}
