import { useMemo, useState, type ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  sortValue: (row: T) => string | number;
  render: (row: T) => ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize?: number;
  emptyTitle: string;
  emptyBody: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize = 15,
  emptyTitle,
  emptyBody,
}: Props<T>) {
  const [sortKey, setSortKey] = useState(columns[0]?.key ?? "");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey) ?? columns[0];
    if (!col) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = col.sortValue(a);
      const bv = col.sortValue(b);
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [columns, dir, rows, sortKey]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const slice = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function onSort(key: string) {
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("asc");
    }
    setPage(0);
  }

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-line bg-card px-6 py-12 text-center">
        <p className="font-serif text-xl text-ink">{emptyTitle}</p>
        <p className="mt-2 text-sm text-ink-soft">{emptyBody}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto border border-line">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-paper-2">
            <tr>
              {columns.map((col) => (
                <th key={col.key} scope="col" className="border-b border-line px-3 py-2 font-medium">
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => onSort(col.key)}
                    aria-sort={
                      sortKey === col.key ? (dir === "asc" ? "ascending" : "descending") : "none"
                    }
                  >
                    {col.header}
                    {sortKey === col.key ? (dir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-card">
            {slice.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line last:border-b-0">
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 align-top">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-ink-soft">
        <p>
          {sorted.length} row{sorted.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="border border-line px-2 py-1 disabled:opacity-40"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span>
            Page {safePage + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="border border-line px-2 py-1 disabled:opacity-40"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
