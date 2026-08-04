import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { dailySheetDoc, dailySheetRowsRef, db } from "./collections";
import { now, writeAudit, type Actor } from "./write";
import {
  newLineId,
  type DateKey,
  type GymFeeMode,
  type Product,
  type SheetExtra,
  type SheetItem,
} from "./types";

const rowDoc = (date: DateKey, rowId: string) =>
  doc(db(), "daily_sheets", date, "rows", rowId);

/** Creates the day's sheet if it does not exist yet. Safe to call repeatedly. */
export async function ensureSheet(date: DateKey): Promise<void> {
  const ref = dailySheetDoc(date);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, {
    date,
    closedAt: null,
    createdAt: now(),
    updatedAt: now(),
  } as never);
}

/**
 * The next free number on a sheet.
 *
 * One past the highest position in use, never the row count. Deleting a row
 * leaves a gap, so once anything has been removed the count is lower than the
 * highest number and counting rows hands out a position that is already taken.
 * Two rows sharing a position then sort by document id, which silently
 * reshuffles the sheet.
 */
export function nextPosition(rows: readonly { position: number }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.position), 0) + 1;
}

export async function addSheetRow(
  date: DateKey,
  row: {
    clientId: string | null;
    clientName: string;
    /** Every row already on the sheet, so the new one lands after all of them. */
    existing: readonly { position: number }[];
    gymFeeMode: GymFeeMode;
  },
  actor: Actor,
): Promise<string> {
  const ref = doc(dailySheetRowsRef(date));
  await setDoc(ref, {
    position: nextPosition(row.existing),
    clientId: row.clientId,
    clientName: row.clientName,
    // The key is handed over at the desk, so the row starts without one.
    keyNumber: null,
    gymFeeMode: row.gymFeeMode,
    gymFee: 0,
    items: [],
    discount: 0,
    note: null,
    createdBy: actor?.id ?? null,
    createdAt: now(),
    updatedAt: now(),
  } as never);

  writeAudit({
    actor,
    action: "create",
    entity: "daily_sheet_row",
    entityId: ref.id,
    after: { date, clientName: row.clientName },
  });

  return ref.id;
}

/**
 * Adds a product to a row, snapshotting its name and price.
 *
 * Buying the same thing twice merges into the existing line, because the desk
 * thinks in "three waters" rather than three separate waters. But it only
 * merges into an **unpaid** line: once money has changed hands for a line,
 * folding a new purchase into it would silently mark that purchase collected
 * too. A member who pays and then buys another drink gets a second line.
 */
export async function addRowItem(
  date: DateKey,
  rowId: string,
  current: SheetItem[],
  product: Product,
  qty: number,
): Promise<SheetItem[]> {
  const open = current.find((i) => i.productId === product.id && !i.paid);

  const items = open
    ? current.map((i) =>
        i.lineId === open.lineId
          ? { ...i, qty: i.qty + qty, lineTotal: (i.qty + qty) * i.unitPrice }
          : i,
      )
    : [
        ...current,
        {
          lineId: newLineId(),
          productId: product.id,
          productName: product.name,
          unitPrice: product.sellPrice,
          qty,
          lineTotal: product.sellPrice * qty,
        },
      ];

  await updateDoc(rowDoc(date, rowId), { items, updatedAt: now() });
  return items;
}

export async function removeRowItem(
  date: DateKey,
  rowId: string,
  current: SheetItem[],
  lineId: string,
): Promise<SheetItem[]> {
  const items = current.filter((i) => i.lineId !== lineId);
  await updateDoc(rowDoc(date, rowId), { items, updatedAt: now() });
  return items;
}

export async function setRowGymFee(
  date: DateKey,
  rowId: string,
  mode: GymFeeMode,
  amount: number,
): Promise<void> {
  await updateDoc(rowDoc(date, rowId), {
    gymFeeMode: mode,
    gymFee: mode === "cash" ? amount : 0,
    updatedAt: now(),
  });
}

/**
 * Records an amount against one of the gym's own columns.
 *
 * Zero clears the cell rather than storing a zero, so an untouched column
 * leaves no trace on the row and the sheet stays readable in the console.
 * Deliberately does not clear the paid mark: correcting a typo in an amount
 * that has already been collected should not silently un-collect it, which is
 * how `setRowGymFee` behaves too.
 */
export async function setRowExtra(
  date: DateKey,
  rowId: string,
  columnId: string,
  amount: number,
  previous?: SheetExtra,
): Promise<void> {
  const value = Math.max(0, amount);
  await updateDoc(rowDoc(date, rowId), {
    [`extras.${columnId}`]:
      value > 0
        ? { amount: value, ...(previous?.paid ? { paid: true } : {}) }
        : deleteField(),
    updatedAt: now(),
  });
}

/** Marks one custom column's amount collected, or takes the mark back off. */
export async function setRowExtraPaid(
  date: DateKey,
  rowId: string,
  columnId: string,
  paid: boolean,
): Promise<void> {
  await updateDoc(rowDoc(date, rowId), {
    [`extras.${columnId}.paid`]: paid,
    updatedAt: now(),
  });
}

/** Marks the floor fee collected, or takes the mark back off. */
export async function setGymFeePaid(
  date: DateKey,
  rowId: string,
  paid: boolean,
): Promise<void> {
  await updateDoc(rowDoc(date, rowId), { gymFeePaid: paid, updatedAt: now() });
}

/** Marks one product line collected. Returns the new items array. */
export async function setItemPaid(
  date: DateKey,
  rowId: string,
  current: SheetItem[],
  lineId: string,
  paid: boolean,
): Promise<SheetItem[]> {
  const items = current.map((i) => (i.lineId === lineId ? { ...i, paid } : i));
  await updateDoc(rowDoc(date, rowId), { items, updatedAt: now() });
  return items;
}

export async function setRowDiscount(
  date: DateKey,
  rowId: string,
  discount: number,
): Promise<void> {
  await updateDoc(rowDoc(date, rowId), {
    discount: Math.max(0, discount),
    updatedAt: now(),
  });
}

export async function setRowKeyNumber(
  date: DateKey,
  rowId: string,
  keyNumber: number | null,
): Promise<void> {
  await updateDoc(rowDoc(date, rowId), { keyNumber, updatedAt: now() });
}

export async function deleteSheetRow(
  date: DateKey,
  rowId: string,
  actor: Actor,
): Promise<void> {
  await deleteDoc(rowDoc(date, rowId));
  writeAudit({
    actor,
    action: "delete",
    entity: "daily_sheet_row",
    entityId: rowId,
    before: { date },
  });
}
