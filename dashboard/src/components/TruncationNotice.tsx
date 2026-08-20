export function TruncationNotice({
  truncated,
  fetched,
  total,
}: {
  truncated: boolean;
  fetched: number;
  total: number | null;
}) {
  if (!truncated) return null;
  return (
    <p role="alert" className="mb-4 border border-copper bg-card px-4 py-3 text-sm text-ink">
      This extract is incomplete: loaded {fetched.toLocaleString()}
      {total != null ? ` of ${total.toLocaleString()}` : ""} events. Narrow the study period or case
      filters so counts stay complete.
    </p>
  );
}
