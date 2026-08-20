import { useState } from "react";
import type { CaseRecord, DatePreset, DeliveryContext, DeviceType, EventType, Filters } from "../lib/types";
import { isoDateInput } from "../lib/dates";
import { defaultFilters, MIN_SESSION_PRESETS } from "../lib/FilterProvider";
import { deletePreset, describeFilters, loadPresets, presetToFilters, savePreset, type SavedPreset } from "../lib/filterPresets";

const presets: Array<{ id: DatePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "thisMonth", label: "This month" },
  { id: "previousMonth", label: "Previous month" },
  { id: "custom", label: "Custom range" },
];

type Props = {
  cases: CaseRecord[];
  filters: Filters;
  onChange: (next: Filters) => void;
  showEventFilter?: boolean;
  showSearch?: boolean;
  compact?: boolean;
  hideCases?: boolean;
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FilterBar({ cases, filters, onChange, showEventFilter, showSearch, compact, hideCases }: Props) {
  const [presetName, setPresetName] = useState("");
  const [presetsSaved, setPresetsSaved] = useState<SavedPreset[]>(() => loadPresets());
  const chips = describeFilters(filters, cases);

  function clearExtras() {
    const next = defaultFilters();
    onChange({
      ...filters,
      caseIds: [],
      eventTypes: [],
      deliveryContexts: [],
      deviceTypes: [],
      search: "",
      includeNonProduction: next.includeNonProduction,
      minSessionSeconds: 0,
    });
  }

  return (
    <section aria-label="Report filters" className="mb-6 border border-line bg-card p-4">
      {chips.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
          {chips.map((chip) => (
            <span key={chip} className="border border-teal/40 bg-paper px-2 py-1 text-xs text-teal-deep">
              {chip}
            </span>
          ))}
          <button type="button" className="text-xs text-ink-soft underline-offset-2 hover:underline" onClick={clearExtras}>
            Clear extra filters
          </button>
        </div>
      ) : null}
      <div>
        <p className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Study period</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={filters.preset === p.id}
              onClick={() => onChange({ ...filters, preset: p.id })}
              className={[
                "rounded-sm border px-3 py-1.5 text-sm",
                filters.preset === p.id
                  ? "border-teal bg-teal text-card"
                  : "border-line bg-paper text-ink hover:border-teal",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>
        {filters.preset === "custom" ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="text-sm text-ink-soft">
              From
              <input
                type="date"
                className="ml-2 border border-line bg-paper px-2 py-1 text-ink"
                value={isoDateInput(filters.from)}
                onChange={(e) =>
                  onChange({ ...filters, from: new Date(`${e.target.value}T00:00:00`) })
                }
              />
            </label>
            <label className="text-sm text-ink-soft">
              To
              <input
                type="date"
                className="ml-2 border border-line bg-paper px-2 py-1 text-ink"
                value={isoDateInput(filters.to)}
                onChange={(e) =>
                  onChange({ ...filters, to: new Date(`${e.target.value}T00:00:00`) })
                }
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Minimum session length</p>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-soft">
          Hide quick click-throughs. Uses reported elapsed time, or wall-clock from start to last action when elapsed
          is missing.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MIN_SESSION_PRESETS.map((p) => (
            <button
              key={p.seconds}
              type="button"
              aria-pressed={filters.minSessionSeconds === p.seconds}
              onClick={() => onChange({ ...filters, minSessionSeconds: p.seconds })}
              className={[
                "rounded-sm border px-3 py-1.5 text-sm",
                filters.minSessionSeconds === p.seconds
                  ? "border-teal bg-teal text-card"
                  : "border-line bg-paper text-ink hover:border-teal",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          Custom minimum (minutes)
          <input
            type="number"
            min={0}
            step={1}
            className="w-20 border border-line bg-paper px-2 py-1 text-ink"
            value={
              MIN_SESSION_PRESETS.some((p) => p.seconds === filters.minSessionSeconds)
                ? ""
                : filters.minSessionSeconds
                  ? String(Math.round(filters.minSessionSeconds / 60))
                  : ""
            }
            placeholder="—"
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (!raw) {
                onChange({ ...filters, minSessionSeconds: 0 });
                return;
              }
              const mins = Number(raw);
              onChange({
                ...filters,
                minSessionSeconds: Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60) : 0,
              });
            }}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
        {showSearch ? (
          <label className="block min-w-0 flex-1 text-sm">
            <span className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Search</span>
            <input
              type="search"
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              placeholder="Session, case, city, region, postal, or site code"
              className="mt-2 w-full border border-line bg-paper px-3 py-2"
            />
          </label>
        ) : null}
        <label className="flex items-center gap-2 pb-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={filters.includeNonProduction}
            onChange={(e) => onChange({ ...filters, includeNonProduction: e.target.checked })}
          />
          Include seed and test events
        </label>
      </div>

      <details className="mt-4 border-t border-line pt-3" open={!compact}>
        <summary className="cursor-pointer text-sm font-medium text-teal-deep">
          Case, access, and device filters
        </summary>
        <div className="mt-4 grid gap-4">
          {!hideCases ? (
          <fieldset>
            <legend className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Cases</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={[
                  "rounded-sm border px-3 py-1.5 text-sm",
                  filters.caseIds.length === 0
                    ? "border-teal bg-teal text-card"
                    : "border-line bg-paper",
                ].join(" ")}
                onClick={() => onChange({ ...filters, caseIds: [] })}
              >
                All cases
              </button>
              {cases.map((c) => (
                <label key={c.id} className="flex items-center gap-2 border border-line bg-paper px-2 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={filters.caseIds.includes(c.id)}
                    onChange={() => onChange({ ...filters, caseIds: toggle(filters.caseIds, c.id) })}
                  />
                  {c.display_name}
                </label>
              ))}
            </div>
          </fieldset>
          ) : null}

          {showEventFilter ? (
            <fieldset>
              <legend className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Events</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["case_started", "case_completed", "case_exited", "case_checkpoint"] as EventType[]).map((t) => (
                  <label key={t} className="flex items-center gap-2 border border-line bg-paper px-2 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={filters.eventTypes.includes(t)}
                      onChange={() => onChange({ ...filters, eventTypes: toggle(filters.eventTypes, t) })}
                    />
                    {t.replace("case_", "")}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <fieldset>
              <legend className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Access</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["github_direct", "wix_embedded", "unknown"] as DeliveryContext[]).map((t) => (
                  <label key={t} className="flex items-center gap-2 border border-line bg-paper px-2 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={filters.deliveryContexts.includes(t)}
                      onChange={() =>
                        onChange({ ...filters, deliveryContexts: toggle(filters.deliveryContexts, t) })
                      }
                    />
                    {t === "github_direct" ? "GitHub Pages" : t === "wix_embedded" ? "Wix embed" : "Unknown"}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Device</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["desktop", "tablet", "mobile", "unknown"] as DeviceType[]).map((t) => (
                  <label key={t} className="flex items-center gap-2 border border-line bg-paper px-2 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={filters.deviceTypes.includes(t)}
                      onChange={() => onChange({ ...filters, deviceTypes: toggle(filters.deviceTypes, t) })}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      </details>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Saved views</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-sm text-ink-soft">
            Name
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Facilitated runs ≥10 min"
              className="ml-2 border border-line bg-paper px-2 py-1 text-ink"
            />
          </label>
          <button
            type="button"
            className="border border-line bg-paper px-3 py-1.5 text-sm"
            onClick={() => {
              setPresetsSaved(savePreset(presetName, filters));
              setPresetName("");
            }}
          >
            Save current filters
          </button>
        </div>
        {presetsSaved.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {presetsSaved.map((p) => (
              <li key={p.id} className="flex items-center gap-1 border border-line bg-paper">
                <button
                  type="button"
                  className="px-2 py-1 text-sm hover:text-teal-deep"
                  onClick={() => onChange(presetToFilters(p))}
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-xs text-ink-soft hover:text-danger"
                  aria-label={`Delete saved view ${p.name}`}
                  onClick={() => setPresetsSaved(deletePreset(p.id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
