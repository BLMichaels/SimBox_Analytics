import { formatPercent } from "../lib/dates";
import type { CountRow } from "../lib/reporting";

type Props = {
  title: string;
  caption?: string;
  rows: CountRow[];
  empty: string;
  nLabel?: string;
  percentLabel?: string;
};

export function CountTable({ title, caption, rows, empty, nLabel = "n", percentLabel = "%" }: Props) {
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
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <td className="px-4 py-2">{row.label}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">{row.n}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">{formatPercent(row.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
