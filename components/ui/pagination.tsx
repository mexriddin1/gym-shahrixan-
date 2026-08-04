"use client";

import { useState } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

import { Button } from "./button";

/**
 * Paging for lists that are not TanStack tables.
 *
 * `DataTable` gets paging from the table instance; every other long list on the
 * site is a plain `<ul>` or a hand-written `<table>` and had none, so a member
 * with two years of history rendered two years of rows. This is the same
 * control and the same wording, so both kinds of list page identically.
 */
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  // Filtering can shrink the list under the current page. Clamp on the way out
  // rather than in an effect, which would render one empty page first.
  const current = Math.min(page, pageCount - 1);
  const start = current * pageSize;

  return {
    page: current,
    pageCount,
    pageItems: items.slice(start, start + pageSize),
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, items.length),
    total: items.length,
    setPage,
  };
}

export function Pagination({
  page,
  pageCount,
  from,
  to,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className="mt-2 flex items-center justify-between gap-3 print:hidden">
      <p className="nums text-xs text-muted-foreground">
        {from} - {to} / {total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Oldingi sahifa"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          <CaretLeftIcon />
        </Button>
        <span className="nums px-2 text-xs text-muted-foreground">
          {page + 1} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Keyingi sahifa"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
        >
          <CaretRightIcon />
        </Button>
      </div>
    </div>
  );
}
