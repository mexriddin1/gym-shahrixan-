"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  IdentificationBadgeIcon,
  PrinterIcon,
} from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { getWorkerAdvances, listWorkers } from "@/lib/db/queries";
import { setWorkerAdvance } from "@/lib/db/mutations";
import { workerFullName, type Worker } from "@/lib/db/types";
import { useResource } from "@/lib/db/use-resource";
import {
  cn,
  dateKey,
  formatCell,
  formatDateKey,
  formatSom,
} from "@/lib/utils";
import { useCellNavigation } from "@/components/grid/use-cell-navigation";
import { MoneyCell } from "@/components/grid/money-cell";
import { PageHeader } from "@/components/app/app-shell";
import { DayTabs } from "@/components/app/day-tabs";
import { Button, buttonClasses } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";

/** The only editable column: what this worker drew today. */
const COL_AMOUNT = 0;

/**
 * Advances drawn against wages, one day at a time.
 *
 * Built as the same grid as the daily sheet on purpose: one row per person,
 * one number to type, the same day tabs along the top and the same keyboard
 * navigation. The desk already knows how to use it, and a wage advance is the
 * same kind of act as a floor fee - somebody at the counter writing down that
 * money moved.
 *
 * Money OUT, unlike every other screen here. That distinction is carried in
 * the report, where advances are subtracted rather than added.
 */
export default function AdvancePage() {
  const [date, setDate] = useState(() => dateKey());
  const { staff } = useAuth();
  const actor = useMemo(
    () => (staff ? { id: staff.id, email: staff.email } : null),
    [staff],
  );

  const { data, loading, error, reload, mutate } = useResource(async () => {
    const [workers, today] = await Promise.all([
      listWorkers(),
      getWorkerAdvances(date),
    ]);
    return { workers, today };
  }, [date]);

  const workers = useMemo(() => data?.workers ?? [], [data]);

  const amountFor = useCallback(
    (worker: Worker) => data?.today.get(worker.id)?.amount ?? 0,
    [data],
  );

  const [editing, setEditing] = useState<{
    row: number;
    col: number;
    char?: string;
  } | null>(null);

  const nav = useCellNavigation({
    rowCount: Math.max(workers.length, 1),
    colCount: 1,
    onActivate: (pos, char) => setEditing({ ...pos, char }),
  });

  const commitCell = useCallback(
    async (rowIndex: number, _colIndex: number, next: number) => {
      const worker = workers[rowIndex];
      if (!worker) return;
      setEditing(null);

      const previous = data?.today.get(worker.id)?.amount ?? 0;
      if (previous === next) return;

      // Optimistic, the same as the daily sheet: nobody should wait on a round
      // trip to see a number they just typed. Rolled back below if it fails.
      const apply = (amount: number) => (current: NonNullable<typeof data>) => {
        const today = new Map(current.today);
        if (amount > 0) {
          const existing = today.get(worker.id);
          today.set(worker.id, {
            ...(existing ?? {
              id: worker.id,
              createdBy: null,
              createdAt: null as never,
              updatedAt: null as never,
            }),
            workerName: workerFullName(worker),
            amount,
          });
        } else {
          today.delete(worker.id);
        }
        return { ...current, today };
      };

      mutate(apply(next));

      try {
        await setWorkerAdvance(date, worker, next, actor);
      } catch {
        mutate(apply(previous));
        toast.error("Saqlab bo'lmadi. Qayta urinib ko'ring.");
      }
    },
    [workers, data, date, mutate, actor],
  );

  const dayTotal = workers.reduce((sum, w) => sum + amountFor(w), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Avans"
        subtitle={formatDateKey(date)}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="print:hidden"
          >
            <PrinterIcon />
            Chop etish
          </Button>
        }
      />

      <DayTabs date={date} onChange={setDate} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Skeleton className="h-64 w-full" />
      ) : workers.length === 0 ? (
        <div className="border border-border bg-card">
          <EmptyState
            icon={IdentificationBadgeIcon}
            title="Ishchi yo'q"
            description="Avans yozish uchun avval Sozlamalarda ishchi qo'shing."
            action={
              <Link
                href="/sozlamalar"
                className={buttonClasses({ size: "sm" })}
              >
                Sozlamalarga o&apos;tish
              </Link>
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto border border-border bg-card">
          <table
            role="grid"
            aria-label={`${formatDateKey(date)} avans jadvali`}
            className="w-full table-fixed border-collapse text-xs"
          >
            {/* Fixed layout from one colgroup, same as the daily sheet, so the
                columns line up row to row rather than being sized by whatever
                each cell happens to contain. */}
            <colgroup>
              <col className="w-12" />
              <col />
              <col className="w-36" />
            </colgroup>

            <thead>
              <tr className="bg-grid-header">
                <Th className="text-center">№</Th>
                <Th className="text-left">Ishchi</Th>
                <Th className="text-right">Avans</Th>
              </tr>
            </thead>

            <tbody>
              {workers.map((worker, rowIndex) => {
                const amount = amountFor(worker);
                return (
                  <tr
                    key={worker.id}
                    className="border-b border-grid-line last:border-0 hover:bg-grid-row-hover"
                  >
                    <Td className="text-center text-muted-foreground">
                      <span className="nums">
                        {String(rowIndex + 1).padStart(2, "0")}
                      </span>
                    </Td>

                    <Td className="text-left font-medium">
                      <span className="truncate">{workerFullName(worker)}</span>
                    </Td>

                    <MoneyCell
                      value={amount}
                      label={`${workerFullName(worker)}, avans`}
                      editing={
                        editing?.row === rowIndex && editing.col === COL_AMOUNT
                      }
                      initialChar={editing?.char}
                      focused={nav.isFocused(rowIndex, COL_AMOUNT)}
                      tabIndex={nav.isFocused(rowIndex, COL_AMOUNT) ? 0 : -1}
                      cellRef={nav.register(rowIndex, COL_AMOUNT)}
                      onStartEdit={() =>
                        setEditing({ row: rowIndex, col: COL_AMOUNT })
                      }
                      onCommit={(next) => commitCell(rowIndex, COL_AMOUNT, next)}
                      onCancel={() => setEditing(null)}
                      onKeyDown={(e) =>
                        nav.handleKeyDown(e, { row: rowIndex, col: COL_AMOUNT })
                      }
                      onFocus={() =>
                        nav.setFocused({ row: rowIndex, col: COL_AMOUNT })
                      }
                    />
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-border bg-grid-header font-medium">
                <Td />
                <Td className="text-left">Jami</Td>
                <Td className="nums text-right font-semibold">
                  {formatCell(dayTotal)}
                </Td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {workers.length > 0 ? (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <Total label="Bugun berilgan" value={dayTotal} />
        </div>
      ) : null}
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="nums font-medium">{formatSom(value)}</span>
    </span>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "h-8 border-r border-b border-grid-line px-2 align-middle",
        "text-[0.7rem] font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase",
        "last:border-r-0",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "h-row border-r border-grid-line px-2 align-middle last:border-r-0",
        className,
      )}
    >
      {children}
    </td>
  );
}
