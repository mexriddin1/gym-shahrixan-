"use client";

import { useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpDownIcon,
  CaretUpIcon,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";

/**
 * Shared list table for the entity screens.
 *
 * Same visual language as the daily sheet (hairlines, tabular figures, tight
 * rows) but comfortable row height, since these are read and scanned rather
 * than typed into.
 */
export function DataTable<T>({
  columns,
  data,
  loading,
  error,
  onRetry,
  empty,
  pageSize = 20,
  rowClassName,
  onRowClick,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty: ReactNode;
  pageSize?: number;
  rowClassName?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  if (error) {
    return (
      <div className="border border-border bg-card">
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="overflow-hidden border border-border bg-card">
        <SkeletonRows rows={8} />
      </div>
    );
  }

  if (data.length === 0) {
    return <div className="border border-border bg-card">{empty}</div>;
  }

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="bg-grid-header">
                {group.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={cn(
                        "h-8 border-b border-grid-line px-3 text-left align-middle",
                        "text-[0.7rem] font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase",
                      )}
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 flex items-center gap-1 rounded px-1 py-0.5 transition-colors outline-none hover:text-foreground"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sorted === "asc" ? (
                            <CaretUpIcon className="size-3" />
                          ) : sorted === "desc" ? (
                            <CaretDownIcon className="size-3" />
                          ) : (
                            <CaretUpDownIcon className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(
                  "border-b border-grid-line last:border-0",
                  "transition-colors hover:bg-grid-row-hover",
                  onRowClick && "cursor-pointer",
                  rowClassName?.(row.original),
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="h-row-lg px-3 align-middle whitespace-nowrap"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="nums text-xs text-muted-foreground">
            {table.getState().pagination.pageIndex * pageSize + 1}
            {" - "}
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * pageSize,
              data.length,
            )}
            {" / "}
            {data.length}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Oldingi sahifa"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <CaretLeftIcon />
            </Button>
            <span className="nums px-2 text-xs text-muted-foreground">
              {table.getState().pagination.pageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Keyingi sahifa"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <CaretRightIcon />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
