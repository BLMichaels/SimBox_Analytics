type Props = {
  label: string;
  value: string;
  hint?: string;
};

export function KpiCard({ label, value, hint }: Props) {
  return (
    <article className="border border-line bg-card px-4 py-4">
      <h3 className="text-xs font-medium tracking-wide text-ink-soft uppercase">{label}</h3>
      <p className="font-serif mt-2 text-3xl font-semibold tracking-tight text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </article>
  );
}
