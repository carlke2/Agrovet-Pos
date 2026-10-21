import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import EmptyState from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

export type Column<T> = {
  key: string;
  header: string;
  numeric?: boolean;
  render?: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  density?: "compact" | "comfortable";
  emptyTitle?: string;
  emptyMessage?: string;
  emptyMode?: "empty" | "search";
  emptyAction?: ReactNode;
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectedKeysChange?: (keys: string[]) => void;
};

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  density = "comfortable",
  emptyTitle = "Nothing here yet",
  emptyMessage = "Records will show up here once they exist.",
  emptyMode = "empty",
  emptyAction,
  selectable = false,
  selectedKeys = [],
  onSelectedKeysChange,
}: DataTableProps<T>) {
  if (loading) {
    return <TableSkeleton rows={5} columns={columns.length + (selectable ? 1 : 0)} />;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-sand bg-surface">
        <EmptyState mode={emptyMode} title={emptyTitle} message={emptyMessage} action={emptyAction} />
      </div>
    );
  }

  const pad = density === "compact" ? "px-3 py-2" : "px-4 py-3";
  const allSelected = rows.every((row) => selectedKeys.includes(rowKey(row)));

  const toggleAll = () => {
    if (!onSelectedKeysChange) return;
    onSelectedKeysChange(allSelected ? [] : rows.map(rowKey));
  };

  const toggleOne = (key: string) => {
    if (!onSelectedKeysChange) return;
    onSelectedKeysChange(selectedKeys.includes(key) ? selectedKeys.filter((item) => item !== key) : [...selectedKeys, key]);
  };

  return (
    <div className="overflow-auto rounded-card border border-sand bg-surface">
      <table className="min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-primary-50 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            {selectable && (
              <th className={cn(pad, "w-10")}>
                <input type="checkbox" aria-label="Select all rows" checked={allSelected} onChange={toggleAll} />
              </th>
            )}
            {columns.map((column) => (
              <th key={column.key} className={cn(pad, "font-semibold", column.numeric && "text-right")}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr key={key} className="border-t border-sand">
                {selectable && (
                  <td className={pad}>
                    <input
                      type="checkbox"
                      aria-label={`Select row ${key}`}
                      checked={selectedKeys.includes(key)}
                      onChange={() => toggleOne(key)}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.key} className={cn(pad, "text-ink", column.numeric && "tabular text-right")}>
                    {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
