"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  PlusIcon,
  PrinterIcon,
  ReceiptIcon,
  TrashIcon,
  XIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import {
  getDailySheet,
  getSettings,
  listActiveSubscriptions,
  listClients,
} from "@/lib/db/queries";
import {
  addRowItem,
  addSheetRow,
  deleteSheetRow,
  ensureSheet,
  removeRowItem,
  setGymFeePaid,
  setItemPaid,
  setRowDiscount,
  setRowExtra,
  setRowExtraPaid,
  setRowGymFee,
  setRowKeyNumber,
} from "@/lib/db/sheet-mutations";
import {
  rowCollected,
  rowTotal,
  type Client,
  type DailySheetRow,
  type Product,
  type SheetColumn,
} from "@/lib/db/types";
import { useResource } from "@/lib/db/use-resource";
import { derivedStatus } from "@/lib/domain/subscription";
import { gymFeeModeFor } from "@/lib/domain/gym-fee";
import { dailyReceipt } from "@/lib/domain/receipt";
import {
  addDays,
  cn,
  dateKey,
  formatCell,
  formatDateKey,
  formatSom,
} from "@/lib/utils";
import { useCellNavigation } from "@/components/grid/use-cell-navigation";
import { MoneyCell } from "@/components/grid/money-cell";
import { NewRowInput } from "@/components/grid/new-row-input";
import { PageHeader } from "@/components/app/app-shell";
import { AddItemDialog } from "@/components/app/add-item-dialog";
import { DailyChargeDialog } from "@/components/app/daily-charge-dialog";
import { ReceiptDialog } from "@/components/app/receipt-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/use-confirm";

/**
 * Editable cells, left to right. Products and the total are not cells.
 *
 * The gym's own columns sit between the floor fee and the discount, so the
 * discount's index depends on how many of them there are. Everything to the
 * left of them is fixed.
 */
const COL_KEY = 0;
const COL_GYM = 1;
const COL_EXTRA = 2;

export default function DailySheetPage() {
  const [date, setDate] = useState(() => dateKey());
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [itemRow, setItemRow] = useState<DailySheetRow | null>(null);
  const [receiptRow, setReceiptRow] = useState<DailySheetRow | null>(null);
  const [chargeRow, setChargeRow] = useState<DailySheetRow | null>(null);
  const { staff } = useAuth();
  // Memoised so the add-row callbacks below keep a stable identity; a fresh
  // object literal here would rebuild them on every render.
  const actor = useMemo(
    () => (staff ? { id: staff.id, email: staff.email } : null),
    [staff],
  );

  const { data, loading, error, reload, mutate } = useResource(async () => {
    const [sheet, clients, subs, settings] = await Promise.all([
      getDailySheet(date),
      listClients(),
      listActiveSubscriptions(),
      getSettings(),
    ]);
    return { ...sheet, clients, subs, settings };
  }, [date]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const products = useMemo(() => data?.products ?? [], [data]);

  /** The gym's own money columns, in the order set in Sozlamalar. */
  const extraColumns = useMemo(
    () =>
      [...(data?.settings.sheetColumns ?? [])].sort(
        (a, b) => a.position - b.position,
      ),
    [data],
  );
  const colDiscount = COL_EXTRA + extraColumns.length;
  const colCount = colDiscount + 1;

  /** Members whose subscription covers today, so the floor fee reads "oylik". */
  const covered = useMemo(() => {
    if (!data) return new Set<string>();
    const warn = data.settings.expiryWarningDays;
    return new Set(
      data.subs
        .filter((s) => {
          const status = derivedStatus(s, date, warn);
          return status === "active" || status === "expiring";
        })
        .map((s) => s.clientId),
    );
  }, [data, date]);

  const [editing, setEditing] = useState<{
    row: number;
    col: number;
    char?: string;
  } | null>(null);

  const nav = useCellNavigation({
    rowCount: Math.max(rows.length, 1),
    colCount,
    onActivate: (pos, char) => setEditing({ ...pos, char }),
  });

  const commitCell = useCallback(
    async (rowIndex: number, colIndex: number, next: number) => {
      const row = rows[rowIndex];
      if (!row) return;
      setEditing(null);

      // Which column was edited. Anything between the fee and the discount is
      // one of the gym's own, identified by its offset from COL_EXTRA.
      const extra = extraColumns[colIndex - COL_EXTRA] ?? null;
      const isExtra = colIndex >= COL_EXTRA && colIndex < colDiscount && extra;

      const previous =
        colIndex === COL_KEY
          ? (row.keyNumber ?? 0)
          : colIndex === COL_GYM
            ? row.gymFee
            : isExtra
              ? (row.extras?.[extra.id]?.amount ?? 0)
              : row.discount;
      if (previous === next) return;

      const gymMode = (value: number) => gymFeeModeFor(value, row, covered);

      // Optimistic: the desk should never wait on a round trip to see a number
      // it just typed. Rolled back below if the write fails.
      const apply = (value: number) => (r: DailySheetRow) => {
        if (r.id !== row.id) return r;
        if (colIndex === COL_KEY) return { ...r, keyNumber: value || null };
        if (colIndex === COL_GYM) {
          return { ...r, gymFee: value, gymFeeMode: gymMode(value) };
        }
        if (isExtra) {
          const extras = { ...r.extras };
          if (value > 0) {
            extras[extra.id] = { ...extras[extra.id], amount: value };
          } else {
            delete extras[extra.id];
          }
          return { ...r, extras };
        }
        return { ...r, discount: value };
      };

      mutate((current) => ({ ...current, rows: current.rows.map(apply(next)) }));

      try {
        if (colIndex === COL_KEY) {
          await setRowKeyNumber(date, row.id, next || null);
        } else if (colIndex === COL_GYM) {
          await setRowGymFee(date, row.id, gymMode(next), next);
        } else if (isExtra) {
          await setRowExtra(date, row.id, extra.id, next, row.extras?.[extra.id]);
        } else {
          await setRowDiscount(date, row.id, next);
        }
      } catch {
        mutate((current) => ({
          ...current,
          rows: current.rows.map(apply(previous)),
        }));
        toast.error("Saqlab bo'lmadi. Qayta urinib ko'ring.");
      }
    },
    [rows, date, mutate, extraColumns, colDiscount, covered],
  );

  /** Adds a member to the sheet, defaulting the floor fee from their subscription. */
  const addRow = useCallback(
    async (client: Client) => {
      try {
        await ensureSheet(date);
        await addSheetRow(
          date,
          {
            clientId: client.id,
            clientName: `${client.firstName} ${client.lastName ?? ""}`.trim(),
            existing: rows,
            gymFeeMode: covered.has(client.id) ? "subscription" : "none",
          },
          actor,
        );
        reload();
      } catch {
        toast.error("Satr qo'shilmadi");
      }
    },
    [date, rows, covered, actor, reload],
  );

  /**
   * A name nobody recognised: seat them without registering them.
   *
   * No client record is created. Someone paying for a single day is not a
   * member, and putting them in the members list would bury the people who
   * actually hold subscriptions under a pile of one-off visitors. The row
   * keeps the name and a null clientId, which is all the day needs.
   */
  const addWalkIn = useCallback(
    async (name: string) => {
      try {
        await ensureSheet(date);
        await addSheetRow(
          date,
          {
            clientId: null,
            clientName: name,
            existing: rows,
            // Never been here before, so there is nothing to cover the floor.
            gymFeeMode: "none",
          },
          actor,
        );
        reload();
      } catch {
        toast.error("Satr qo'shilmadi");
      }
    },
    [date, rows, actor, reload],
  );

  async function handleAddItem(product: Product, qty: number) {
    if (!itemRow) return;
    try {
      const items = await addRowItem(date, itemRow.id, itemRow.items, product, qty);
      mutate((current) => ({
        ...current,
        rows: current.rows.map((r) => (r.id === itemRow.id ? { ...r, items } : r)),
      }));
    } catch {
      toast.error("Mahsulot qo'shilmadi");
    }
  }

  async function handleDeleteRow(row: DailySheetRow) {
    // Dropped from the visible sheet first; the desk has someone standing
    // there and should not wait on a round trip to see the row go.
    mutate((current) => ({
      ...current,
      rows: current.rows.filter((r) => r.id !== row.id),
    }));
    try {
      await deleteSheetRow(date, row.id, actor);
    } catch {
      toast.error("O'chirib bo'lmadi");
      reload();
    }
  }

  /**
   * Charges a monthly member for a single day, on this sheet only.
   *
   * The subscription is deliberately left alone. A fourth visit in a week the
   * monthly rate covers three of is a day bought at the desk, not a change to
   * what the member is on — so it lives on the row, and tomorrow's sheet reads
   * "oylik" again.
   */
  async function handleChargeDay(row: DailySheetRow, amount: number) {
    const swap =
      (mode: DailySheetRow["gymFeeMode"], gymFee: number) =>
      (r: DailySheetRow) =>
        r.id === row.id ? { ...r, gymFeeMode: mode, gymFee } : r;

    mutate((current) => ({
      ...current,
      rows: current.rows.map(swap("cash", amount)),
    }));

    try {
      await setRowGymFee(date, row.id, "cash", amount);
    } catch {
      mutate((current) => ({
        ...current,
        rows: current.rows.map(swap("subscription", 0)),
      }));
      toast.error("Saqlab bo'lmadi");
      // Rethrown so the dialog stays open with the amount still in it.
      throw new Error("gym fee write failed");
    }
  }

  /** Flips whether the floor fee has been collected. */
  async function handleToggleGymFeePaid(row: DailySheetRow) {
    const next = !row.gymFeePaid;
    mutate((current) => ({
      ...current,
      rows: current.rows.map((r) =>
        r.id === row.id ? { ...r, gymFeePaid: next } : r,
      ),
    }));
    try {
      await setGymFeePaid(date, row.id, next);
    } catch {
      mutate((current) => ({
        ...current,
        rows: current.rows.map((r) =>
          r.id === row.id ? { ...r, gymFeePaid: !next } : r,
        ),
      }));
      toast.error("Saqlab bo'lmadi");
    }
  }

  /** Flips whether one of the gym's own charges has been collected. */
  async function handleToggleExtraPaid(row: DailySheetRow, columnId: string) {
    const extra = row.extras?.[columnId];
    if (!extra || extra.amount <= 0) return;
    const next = !extra.paid;

    const swap = (paid: boolean) => (r: DailySheetRow) =>
      r.id === row.id
        ? { ...r, extras: { ...r.extras, [columnId]: { ...extra, paid } } }
        : r;

    mutate((current) => ({ ...current, rows: current.rows.map(swap(next)) }));

    try {
      await setRowExtraPaid(date, row.id, columnId, next);
    } catch {
      mutate((current) => ({
        ...current,
        rows: current.rows.map(swap(!!extra.paid)),
      }));
      toast.error("Saqlab bo'lmadi");
    }
  }

  /** Flips whether one product line has been collected. */
  async function handleToggleItemPaid(row: DailySheetRow, lineId: string) {
    const item = row.items.find((i) => i.lineId === lineId);
    if (!item) return;
    const next = !item.paid;

    const applied = row.items.map((i) =>
      i.lineId === lineId ? { ...i, paid: next } : i,
    );
    mutate((current) => ({
      ...current,
      rows: current.rows.map((r) =>
        r.id === row.id ? { ...r, items: applied } : r,
      ),
    }));

    try {
      await setItemPaid(date, row.id, row.items, lineId, next);
    } catch {
      mutate((current) => ({
        ...current,
        rows: current.rows.map((r) =>
          r.id === row.id ? { ...r, items: row.items } : r,
        ),
      }));
      toast.error("Saqlab bo'lmadi");
    }
  }

  async function handleRemoveItem(row: DailySheetRow, lineId: string) {
    try {
      const items = await removeRowItem(date, row.id, row.items, lineId);
      mutate((current) => ({
        ...current,
        rows: current.rows.map((r) => (r.id === row.id ? { ...r, items } : r)),
      }));
    } catch {
      toast.error("O'chirib bo'lmadi");
    }
  }

  const dayTotal = rows.reduce((sum, r) => sum + rowTotal(r), 0);
  const collected = rows.reduce((sum, r) => sum + rowCollected(r), 0);
  const uncollected = Math.max(0, dayTotal - collected);
  const gymTotal = rows.reduce(
    (sum, r) => sum + (r.gymFeeMode === "cash" ? r.gymFee : 0),
    0,
  );
  const itemsTotal = rows.reduce(
    (sum, r) => sum + r.items.reduce((s, i) => s + i.lineTotal, 0),
    0,
  );
  const discountTotal = rows.reduce((sum, r) => sum + r.discount, 0);
  const extraTotals = new Map(
    extraColumns.map((c) => [
      c.id,
      rows.reduce((sum, r) => sum + (r.extras?.[c.id]?.amount ?? 0), 0),
    ]),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kunlik hisob"
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
        // Only on the very first load. Blanking the table on every refetch
        // swapped the whole sheet for a skeleton each time a row was added,
        // which read as the add having failed.
        <SheetSkeleton />
      ) : (
        <div className="overflow-x-auto border border-border">
          <table
            role="grid"
            aria-label={`${formatDateKey(date)} kunlik hisob varaqasi`}
            className="w-full table-fixed border-collapse text-xs"
          >
            {/* Fixed layout driven by one colgroup. Without it the browser
                sizes each column from its own content, so a row with three
                product chips pushes its neighbours out of line with every
                other row. This is what keeps the grid a grid. */}
            <colgroup>
              <col className="w-12" />
              <col className="w-56" />
              <col className="w-16" />
              <col className="w-28" />
              <col />
              {extraColumns.map((c) => (
                <col key={c.id} className="w-28" />
              ))}
              <col className="w-28" />
              <col className="w-32" />
              <col className="w-32" />
              <col className="w-10" />
            </colgroup>

            <thead>
              <tr className="bg-grid-header">
                <Th className="text-center">№</Th>
                <Th className="text-left">Mijoz</Th>
                <Th className="text-center">Kalit</Th>
                <Th className="text-right">To&apos;lov</Th>
                <Th className="text-left">Mahsulotlar</Th>
                {extraColumns.map((c) => (
                  <Th key={c.id} className="truncate text-right">
                    {c.name}
                  </Th>
                ))}
                <Th className="text-right">Chegirma</Th>
                <Th className="text-right">Jami</Th>
                <Th className="text-right">Berilishi kerak</Th>
                <Th className="print:hidden" />
              </tr>
            </thead>

            <tbody>
              {rows.map((row, rowIndex) => (
                <SheetRow
                  key={row.id}
                  row={row}
                  rowIndex={rowIndex}
                  extraColumns={extraColumns}
                  colDiscount={colDiscount}
                  nav={nav}
                  editing={editing}
                  setEditing={setEditing}
                  onCommit={commitCell}
                  onOpenItems={() => setItemRow(row)}
                  onRemoveItem={(lineId) => handleRemoveItem(row, lineId)}
                  onOpenReceipt={() => setReceiptRow(row)}
                  onChargeDay={() => setChargeRow(row)}
                  onDeleteRow={() =>
                    confirm({
                      title: `${row.clientName} satri o'chirilsinmi?`,
                      description:
                        "Bugungi to'lovi va mahsulotlari ham o'chadi.",
                      run: () => handleDeleteRow(row),
                    })
                  }
                  onToggleGymFeePaid={() => handleToggleGymFeePaid(row)}
                  onToggleItemPaid={(lineId) => handleToggleItemPaid(row, lineId)}
                  onToggleExtraPaid={(columnId) =>
                    handleToggleExtraPaid(row, columnId)
                  }
                />
              ))}

              {/* The blank row. Always there, always ready for the next name.
                  Every column is rendered, empty ones included, so it lines up
                  with the rows above instead of collapsing across them. */}
              <tr className="border-b border-grid-line bg-grid-row-hover/40 print:hidden">
                <Td className="text-center text-muted-foreground">
                  <span className="nums">
                    {String(rows.length + 1).padStart(2, "0")}
                  </span>
                </Td>
                <Td className="p-0">
                  <NewRowInput
                    clients={data?.clients ?? []}
                    existingIds={rows
                      .map((r) => r.clientId)
                      .filter((id): id is string => !!id)}
                    onSelect={addRow}
                    onCreate={addWalkIn}
                  />
                </Td>
                <Td />
                <Td />
                <Td />
                {extraColumns.map((c) => (
                  <Td key={c.id} />
                ))}
                <Td />
                <Td />
                <Td />
                <Td />
              </tr>
            </tbody>

            {rows.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-border bg-grid-header font-medium">
                  <Td />
                  <Td className="text-left">Jami</Td>
                  <Td />
                  <Td className="nums text-right">{formatCell(gymTotal)}</Td>
                  <Td className="nums text-left">{formatCell(itemsTotal)}</Td>
                  {extraColumns.map((c) => (
                    <Td key={c.id} className="nums text-right">
                      {formatCell(extraTotals.get(c.id) ?? 0)}
                    </Td>
                  ))}
                  <Td className="nums text-right">{formatCell(discountTotal)}</Td>
                  <Td className="nums text-right font-semibold">
                    {formatSom(dayTotal)}
                  </Td>
                  <Td
                    className={cn(
                      "nums text-right font-semibold",
                      uncollected > 0 && "text-status-debt-foreground",
                    )}
                  >
                    {formatCell(uncollected)}
                  </Td>
                  <Td className="print:hidden" />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}

      {/* The gym charges on the way out, so what is owed and what is in the
          till are different numbers. Both belong on screen, and they read as a
          summary of the sheet above rather than a header over it. */}
      {rows.length > 0 ? (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <Total label="Kun bo'yicha" value={dayTotal} />
          <Total label="To'langan" value={collected} tone="paid" />
          <Total label="Qolgan" value={uncollected} tone="debt" />
        </div>
      ) : null}

      {confirmDialog}

      <AddItemDialog
        open={itemRow !== null}
        onOpenChange={(open) => !open && setItemRow(null)}
        products={products}
        clientName={itemRow?.clientName ?? ""}
        onAdd={handleAddItem}
      />

      <DailyChargeDialog
        open={chargeRow !== null}
        onOpenChange={(open) => !open && setChargeRow(null)}
        clientName={chargeRow?.clientName ?? ""}
        baseFee={data?.settings.dailyFee ?? 0}
        onConfirm={(amount) => handleChargeDay(chargeRow!, amount)}
      />

      {data ? (
        <ReceiptDialog
          open={receiptRow !== null}
          onOpenChange={(open) => !open && setReceiptRow(null)}
          receipt={
            receiptRow ? dailyReceipt(receiptRow, date, extraColumns) : null
          }
          settings={data.settings}
        />
      ) : null}
    </div>
  );
}

function SheetRow({
  row,
  rowIndex,
  extraColumns,
  colDiscount,
  nav,
  editing,
  setEditing,
  onCommit,
  onOpenItems,
  onRemoveItem,
  onOpenReceipt,
  onChargeDay,
  onDeleteRow,
  onToggleGymFeePaid,
  onToggleItemPaid,
  onToggleExtraPaid,
}: {
  row: DailySheetRow;
  rowIndex: number;
  extraColumns: SheetColumn[];
  colDiscount: number;
  nav: ReturnType<typeof useCellNavigation>;
  editing: { row: number; col: number; char?: string } | null;
  setEditing: (v: { row: number; col: number; char?: string } | null) => void;
  onCommit: (row: number, col: number, next: number) => void;
  onOpenItems: () => void;
  onRemoveItem: (lineId: string) => void;
  onOpenReceipt: () => void;
  onChargeDay: () => void;
  onDeleteRow: () => void;
  onToggleGymFeePaid: () => void;
  onToggleItemPaid: (lineId: string) => void;
  onToggleExtraPaid: (columnId: string) => void;
}) {
  const total = rowTotal(row);
  const owed = Math.max(0, total - rowCollected(row));
  const onSubscription = row.gymFeeMode === "subscription";

  const cell = (col: number) => ({
    editing: editing?.row === rowIndex && editing.col === col,
    initialChar: editing?.char,
    focused: nav.isFocused(rowIndex, col),
    tabIndex: nav.isFocused(rowIndex, col) ? 0 : -1,
    cellRef: nav.register(rowIndex, col),
    onStartEdit: () => setEditing({ row: rowIndex, col }),
    onCommit: (next: number) => onCommit(rowIndex, col, next),
    onCancel: () => setEditing(null),
    onKeyDown: (e: React.KeyboardEvent) =>
      nav.handleKeyDown(e, { row: rowIndex, col }),
    onFocus: () => nav.setFocused({ row: rowIndex, col }),
  });

  return (
    <tr className="group border-b border-grid-line last:border-0 hover:bg-grid-row-hover">
      <Td className="text-center text-muted-foreground">
        <span className="nums">{String(rowIndex + 1).padStart(2, "0")}</span>
      </Td>

      <Td
        className={cn(
          "text-left",
          // Status carried by a 2px edge as well as the tint, so it survives
          // greyscale printing and colour blindness.
          onSubscription && "border-l-2 border-l-status-active-edge",
        )}
      >
        <button
          type="button"
          onClick={onOpenReceipt}
          title="Chekni ochish"
          className="flex w-full items-center gap-1.5 text-left font-medium outline-none hover:underline"
        >
          <span className="truncate">{row.clientName}</span>
          <ReceiptIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 print:hidden" />
        </button>
      </Td>

      <MoneyCell
        {...cell(COL_KEY)}
        value={row.keyNumber ?? 0}
        label={`${row.clientName}, kalit raqami`}
        className="text-center"
      />

      {onSubscription ? (
        <SubscriptionCell
          cellRef={nav.register(rowIndex, COL_GYM)}
          tabIndex={nav.isFocused(rowIndex, COL_GYM) ? 0 : -1}
          focused={nav.isFocused(rowIndex, COL_GYM)}
          onKeyDown={(e) => nav.handleKeyDown(e, { row: rowIndex, col: COL_GYM })}
          onFocus={() => nav.setFocused({ row: rowIndex, col: COL_GYM })}
          onCharge={onChargeDay}
          label={`${row.clientName}, to'lov`}
        />
      ) : (
        <MoneyCell
          {...cell(COL_GYM)}
          value={row.gymFee}
          label={`${row.clientName}, to'lov`}
          paid={row.gymFeePaid}
          onTogglePaid={onToggleGymFeePaid}
        />
      )}

      <Td className="text-left">
        <div className="flex flex-wrap items-center gap-1">
          {row.items.map((item) => (
            <span
              key={item.lineId}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.7rem]",
                item.paid
                  ? "bg-paid font-medium text-paid-foreground"
                  : "bg-muted",
              )}
            >
              {/* Clicking the chip marks the money collected, same as a cell. */}
              <button
                type="button"
                onClick={() => onToggleItemPaid(item.lineId)}
                title="Bosing: to'landi / to'lanmadi"
                className="flex items-center gap-1 outline-none"
              >
                <span className="truncate">{item.productName}</span>
                {/* Quantity is dimmed, the money is not: what the row is worth
                    is the number the desk is checking against the till. */}
                {item.qty > 1 ? (
                  <span
                    className={cn(
                      "nums",
                      item.paid
                        ? "text-paid-foreground/60"
                        : "text-muted-foreground/70",
                    )}
                  >
                    x{item.qty}
                  </span>
                ) : null}
                <span className="nums font-medium">
                  {formatSom(item.lineTotal)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onRemoveItem(item.lineId)}
                aria-label={`${item.productName} ni olib tashlash`}
                className="ml-0.5 text-muted-foreground outline-none hover:text-destructive print:hidden"
              >
                <XIcon className="size-2.5" />
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={onOpenItems}
            aria-label={`${row.clientName} uchun mahsulot qo'shish`}
            className="inline-flex size-5 items-center justify-center rounded-sm border border-dashed border-border text-muted-foreground outline-none transition-colors hover:border-brand hover:text-brand print:hidden"
          >
            <PlusIcon className="size-3" />
          </button>
        </div>
      </Td>

      {/* The gym's own columns. Same money cell as the floor fee, so they
          edit the same way and go yellow once the money is collected. */}
      {extraColumns.map((c, i) => {
        const extra = row.extras?.[c.id];
        return (
          <MoneyCell
            key={c.id}
            {...cell(COL_EXTRA + i)}
            value={extra?.amount ?? 0}
            label={`${row.clientName}, ${c.name}`}
            paid={extra?.paid}
            onTogglePaid={() => onToggleExtraPaid(c.id)}
          />
        );
      })}

      <MoneyCell
        {...cell(colDiscount)}
        value={row.discount}
        label={`${row.clientName}, chegirma`}
      />

      <Td
        className={cn(
          "nums text-right font-medium",
          total === 0 && "text-muted-foreground/50",
        )}
      >
        {formatCell(total)}
      </Td>

      {/* What is still owed on this row: charged less what has been marked
          collected. Zero reads as a dash, so the eye only lands on the rows
          that still need chasing. */}
      <Td
        className={cn(
          "nums text-right font-medium",
          owed > 0 ? "text-status-debt-foreground" : "text-muted-foreground/50",
        )}
      >
        {formatCell(owed)}
      </Td>

      <Td className="print:hidden">
        <button
          type="button"
          onClick={onDeleteRow}
          aria-label={`${row.clientName} satrini o'chirish`}
          title="Satrni o'chirish"
          className="flex size-5 items-center justify-center rounded-sm text-muted-foreground/70 outline-none transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <TrashIcon className="size-3.5" />
        </button>
      </Td>
    </tr>
  );
}

/**
 * The floor-fee cell for a member whose subscription covers today.
 *
 * Reads as a label because there is normally nothing to charge. But the
 * monthly rate only buys three visits a week, so the desk has to be able to
 * turn it into an amount for a single extra day. It opens the same way every
 * other cell on this sheet opens — double click, Enter, or just start typing a
 * number — except that this one asks first, because the answer is about an
 * agreement rather than a keystroke.
 */
function SubscriptionCell({
  cellRef,
  tabIndex,
  focused,
  onKeyDown,
  onFocus,
  onCharge,
  label,
}: {
  cellRef: (el: HTMLElement | null) => void;
  tabIndex: number;
  focused: boolean;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
  onCharge: () => void;
  label: string;
}) {
  return (
    <td
      ref={cellRef as (el: HTMLTableCellElement | null) => void}
      role="gridcell"
      tabIndex={tabIndex}
      aria-label={`${label}: oylik`}
      onFocus={onFocus}
      onClick={(e) => (e.currentTarget as HTMLElement).focus()}
      onDoubleClick={onCharge}
      onKeyDown={(e) => {
        // Enter and digits both mean "put money here", which on this cell is a
        // question rather than an edit. Handled before the grid sees them, so
        // neither opens an editor that this cell does not have.
        if (e.key === "Enter" || (e.key.length === 1 && /\d/.test(e.key))) {
          e.preventDefault();
          onCharge();
          return;
        }
        onKeyDown(e);
      }}
      title="Ikki marta bosing: bugun uchun kunlik to'lov"
      className={cn(
        "h-row cursor-cell px-2 text-right text-xs",
        "border-r border-grid-line outline-none",
        "text-status-active-foreground",
        focused && "bg-grid-cell-focus outline-2 -outline-offset-2 outline-brand",
      )}
    >
      oylik
    </td>
  );
}

function Total({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "paid" | "debt";
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "nums font-medium",
          tone === "paid" && value > 0 && "text-paid-foreground",
          tone === "debt" && value > 0 && "text-status-debt-foreground",
        )}
      >
        {formatSom(value)}
      </span>
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
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "h-row border-r border-grid-line px-2 align-middle last:border-r-0",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Day tabs, mirroring the workbook's sheet tabs along the bottom. */
function DayTabs({
  date,
  onChange,
}: {
  date: string;
  onChange: (next: string) => void;
}) {
  const today = dateKey();

  /**
   * The last seven days up to today, plus the selected day if it fell outside
   * that window.
   *
   * The window used to end at the *selected* day, which pushed today off the
   * strip the moment you stepped back a date. Anchoring it to today means the
   * way home is always one click, and no tab is ever a day that has not
   * happened yet.
   */
  const days = useMemo(() => {
    const recent = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    return recent.includes(date) ? recent : [date, ...recent];
  }, [date, today]);

  return (
    <div className="flex items-center gap-1 print:hidden">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Oldingi kun"
        onClick={() => onChange(addDays(date, -1))}
      >
        <CaretLeftIcon />
      </Button>

      <div className="flex flex-1 gap-1 overflow-x-auto">
        {days.map((day) => {
          const active = day === date;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onChange(day)}
              aria-current={active ? "date" : undefined}
              className={cn(
                "nums shrink-0 rounded-md px-2.5 py-1 text-xs whitespace-nowrap",
                "transition-colors",
                active
                  ? "bg-brand font-medium text-brand-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {formatDateKey(day).slice(0, 5)}
              {day === today ? (
                <span
                  className={cn(
                    "ml-1",
                    active ? "text-brand-foreground/70" : "text-brand",
                  )}
                >
                  •
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Keyingi kun"
        // Cannot step past today: there is nothing to record on a future day.
        disabled={date >= today}
        onClick={() => onChange(addDays(date, 1))}
      >
        <CaretRightIcon />
      </Button>

      {date !== today ? (
        <Button variant="outline" size="sm" onClick={() => onChange(today)}>
          Bugun
        </Button>
      ) : null}
    </div>
  );
}

function SheetSkeleton() {
  return (
    <div className="overflow-hidden border border-border">
      <div className="flex gap-4 border-b border-grid-line bg-grid-header px-3 py-2">
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="ml-auto h-3 w-20" />
      </div>
      <div className="divide-y divide-grid-line">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-2">
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
