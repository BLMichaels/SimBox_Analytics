import { formatPercent } from "../lib/dates";
import type { CountRow } from "../lib/reporting";

type Props = {
  title: string;
  caption?: string;
  rows: CountRow[];
  empty: string;
  nLabel?: string;
  percentLabel?: string;
  onRowClick?: (row: CountRow) => void;
  rowHint?: string;
};

export function CountTable({
  title,
  caption,
  rows,
  empty,
  nLabel = "n",
  percentLabel = "%",
  onRowClick,
  rowHint,
}: Props) {
  return (
    <section className="border border-line bg-card">
      <header className="border-b border-line px-4 py-3">
        <h3 className="font-serif text-lg text-ink">{title}</h3>
        {caption ? <p className="mt-0.5 text-[11px] text-ink-soft">{caption}</p> : null}
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-soft">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-paper-2 text-[11px] tracking-wide text-ink-soft uppercase">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Category
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {nLabel}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {percentLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const interactive = Boolean(onRowClick);
                return (
                  <tr
                    key={row.label}
                    className={[
                      "border-t border-line",
                      interactive ? "cursor-pointer hover:bg-paper" : "",
                    ].join(" ")}
                    onClick={interactive ? () => onRowClick?.(row) : undefined}
                    onKeyDown={
                      interactive
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick?.(row);
                            }
                          }
                        : undefined
                    }
                    tabIndex={interactive ? 0 : undefined}
                    title={interactive ? rowHint : undefined}
                  >
                    <td className="px-4 py-2">
                      <div className="min-w-0">
                        <span className={interactive ? "text-teal-deep underline-offset-2 hover:underline" : ""}>
                          {row.label}
                        </span>
                        <span className="count-meter-track" aria-hidden>
                          <span className="count-meter" style={{ width: `${Math.min(100, row.pct * 100)}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">{row.n}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">{formatPercent(row.pct)}</td>
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
