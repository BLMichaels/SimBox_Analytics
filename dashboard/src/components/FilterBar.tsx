import type { CaseRecord, DatePreset, DeliveryContext, DeviceType, EventType, Filters } from "../lib/types";
import { isoDateInput } from "../lib/dates";

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
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FilterBar({ cases, filters, onChange, showEventFilter, showSearch, compact }: Props) {
  return (
    <section aria-label="Report filters" className="mb-6 border border-line bg-card p-4">
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
    </section>
  );
}
