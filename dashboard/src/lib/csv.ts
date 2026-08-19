export function downloadCsv(filename: string, rows: Record<string, string | number | null>[]): void {
  if (rows.length === 0) {
    const blob = new Blob(["No rows in the current filter.\n"], { type: "text/csv;charset=utf-8" });
    trigger(filename, blob);
    return;
  }
  const headers = Object.keys(rows[0] ?? {});
  const escape = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h] ?? "")).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  trigger(filename, blob);
}

function trigger(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function rangeStamp(from: Date, to: Date): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(from)}-${fmt(to)}`;
}
