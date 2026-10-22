import { useMemo } from "react";
import { hospitalConfidenceLabel, hospitalSourceLabel, identifiedHospitals } from "../lib/reporting";
import type { SessionSummary } from "../lib/reporting";

type Props = {
  sessions: SessionSummary[];
  onSelect?: (hospital: string) => void;
};

export function HospitalTable({ sessions, onSelect }: Props) {
  const rows = useMemo(() => identifiedHospitals(sessions), [sessions]);
  const namedSessions = rows.reduce((n, row) => n + row.sessions, 0);
  const unnamed = Math.max(0, sessions.length - namedSessions);

  return (
    <section id="hospitals" className="border border-line bg-card">
      <header className="border-b border-line px-4 py-3">
        <h2 className="font-serif text-lg text-ink">Hospitals that ran a simulation</h2>
        <p className="mt-0.5 text-[11px] leading-5 text-ink-soft">
          {rows.length
            ? `${rows.length} hospital${rows.length === 1 ? "" : "s"} · ${namedSessions} session${namedSessions === 1 ? "" : "s"}`
            : "No hospital identified in this range."}
          {unnamed
            ? ` · ${unnamed} session${unnamed === 1 ? "" : "s"} stayed unnamed because the network was home, cellular, or a city with several hospitals.`
            : ""}
          {onSelect ? " Click a row to filter to that hospital." : ""}
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-soft">
          None of these sessions could be tied to a single hospital.
        </p>
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-paper-2 text-[11px] tracking-wide text-ink-soft uppercase">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Hospital
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Where
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Confidence
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Sessions
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Completed
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const interactive = Boolean(onSelect);
                return (
                  <tr
                    key={row.name}
                    className={["border-t border-line", interactive ? "cursor-pointer hover:bg-paper" : ""].join(" ")}
                    onClick={interactive ? () => onSelect?.(row.name) : undefined}
                    onKeyDown={
                      interactive
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelect?.(row.name);
                            }
                          }
                        : undefined
                    }
                    tabIndex={interactive ? 0 : undefined}
                    title={hospitalSourceLabel(row.source)}
                  >
                    <td className="px-4 py-2 text-ink">
                      <span className={interactive ? "text-teal-deep underline-offset-2 hover:underline" : ""}>
                        {row.name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-ink-soft">{row.place || "—"}</td>
                    <td className="px-4 py-2 text-ink-soft">{hospitalConfidenceLabel(row.confidence)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.sessions}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.completions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
