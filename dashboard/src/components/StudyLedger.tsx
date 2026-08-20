export type LedgerItem = {
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
};

export function StudyLedger({ items }: { items: LedgerItem[] }) {
  return (
    <dl className="grid grid-cols-2 border border-line bg-card sm:grid-cols-4">
      {items.map((item) => {
        const interactive = Boolean(item.onClick);
        const inner = (
          <>
            <dt className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">{item.label}</dt>
            <dd className="font-serif mt-1 text-[1.65rem] leading-none font-semibold tracking-tight text-ink">
              {item.value}
            </dd>
            {item.hint ? <p className="mt-1.5 text-[11px] leading-snug text-ink-soft">{item.hint}</p> : null}
          </>
        );
        return (
          <div
            key={item.label}
            className="border-b border-r border-line last:border-b-0 sm:[&:nth-child(4n)]:border-r-0"
          >
            {interactive ? (
              <button type="button" className="block w-full px-4 py-3 text-left hover:bg-paper" onClick={item.onClick}>
                {inner}
              </button>
            ) : (
              <div className="px-4 py-3">{inner}</div>
            )}
          </div>
        );
      })}
    </dl>
  );
}
