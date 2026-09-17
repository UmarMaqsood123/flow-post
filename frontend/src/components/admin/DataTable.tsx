import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  label: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  /** Makes rows open a detail page (keyboard reachable through the row's link). */
  rowHref?: (row: T) => string;
  isLoading?: boolean;
  empty?: string;
}

function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  rowHref,
  isLoading,
  empty = "Nothing found.",
}: DataTableProps<T>) {
  const navigate = useNavigate();

  if (isLoading && !rows) return <Skeleton className="h-64 rounded-xl" />;

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[44rem] text-left text-sm" aria-label={label}>
        <thead className="border-b border-line bg-slate-50/70 text-xs text-muted">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn("px-4 py-2.5 font-medium", column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cn(isLoading && "opacity-60")}>
          {rows?.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-muted">
                {empty}
              </td>
            </tr>
          )}
          {rows?.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr
                key={rowKey(row)}
                onClick={href ? () => void navigate(href) : undefined}
                className={cn(
                  "border-t border-line align-top",
                  href && "cursor-pointer hover:bg-slate-50",
                )}
              >
                {columns.map((column) => (
                  <td key={column.key} className={cn("px-4 py-3", column.className)}>
                    {column.render(row)}
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

export default DataTable;
