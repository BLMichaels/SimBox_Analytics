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
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (next: Set<string>) => void;
  compact?: boolean;
  defaultDir?: "asc" | "desc";
  onRowClick?: (row: T) => void;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize = 15,
  emptyTitle,
  emptyBody,
  selectedIds,
  onSelectedIdsChange,
  compact,
  defaultDir = "desc",
  onRowClick,
}: Props<T>) {
  const [sortKey, setSortKey] = useState(columns[0]?.key ?? "");
  const [dir, setDir] = useState<"asc" | "desc">(defaultDir);
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

  const selectable = Boolean(selectedIds && onSelectedIdsChange);
  const pageIds = slice.map((row) => rowKey(row));
  const allPageSelected = selectable && pageIds.length > 0 && pageIds.every((id) => selectedIds!.has(id));

  function toggleOne(id: string) {
    if (!selectedIds || !onSelectedIdsChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function togglePage() {
    if (!selectedIds || !onSelectedIdsChange) return;
    const next = new Set(selectedIds);
    if (allPageSelected) {
      for (const id of pageIds) next.delete(id);
    } else {
      for (const id of pageIds) next.add(id);
    }
    onSelectedIdsChange(next);
  }

  return (
    <div>
      <div className="overflow-x-auto border border-line">
        <table className={["min-w-full border-collapse text-left", compact ? "text-xs" : "text-sm"].join(" ")}>
          <thead className="bg-paper-2">
            <tr>
              {selectable ? (
                <th scope="col" className="w-10 border-b border-line px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePage}
                    aria-label="Select all events on this page"
                  />
                </th>
              ) : null}
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
                    {sortKey === col.key ? (
                      <span aria-hidden>{dir === "asc" ? " ↑" : " ↓"}</span>
                    ) : null}
                    {sortKey === col.key ? (
                      <span className="sr-only">{dir === "asc" ? "sorted ascending" : "sorted descending"}</span>
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-card">
            {slice.map((row) => {
              const id = rowKey(row);
              const checked = selectedIds?.has(id) ?? false;
              return (
                <tr
                  key={id}
                  className={[
                    "border-b border-line last:border-b-0",
                    checked ? "bg-teal/10" : "",
                    onRowClick ? "cursor-pointer hover:bg-paper" : "",
                  ].join(" ")}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {selectable ? (
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select event ${id}`}
                      />
                    </td>
                  ) : null}
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2 align-top">
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
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
