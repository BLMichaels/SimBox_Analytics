export type LedgerItem = {
  label: string;
  value: string;
  hint?: string;
};

export function StudyLedger({ items }: { items: LedgerItem[] }) {
  return (
    <dl className="grid grid-cols-2 border border-line bg-card sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="border-b border-r border-line px-4 py-3 last:border-b-0 sm:[&:nth-child(4n)]:border-r-0">
          <dt className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">{item.label}</dt>
          <dd className="font-serif mt-1 text-[1.65rem] leading-none font-semibold tracking-tight text-ink">
            {item.value}
          </dd>
          {item.hint ? <p className="mt-1.5 text-[11px] leading-snug text-ink-soft">{item.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}
