import {
  extrasTotal,
  rowTotal,
  type DailySheetRow,
  type SheetColumn,
  type Subscription,
} from "@/lib/db/types";
import { computeDebt } from "./pricing";
import { formatDateKey, timestampDay } from "@/lib/utils";

/** One printed line. `amount` null means the note carries the value instead. */
export type ReceiptLine = {
  label: string;
  amount: number | null;
  note?: string;
};

/**
 * Everything a printed receipt needs, independent of what it is a receipt for.
 *
 * Building this shape first means the day's takings and a tariff sale come out
 * of the same printer looking like the same document, which is the point: the
 * member should not be able to tell which screen the staff was on.
 */
export type Receipt = {
  title: string;
  code: number | null;
  dateLabel: string;
  clientName: string;
  meta: { label: string; value: string }[];
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  total: number;
  /** Null when the concept does not apply, as on a same-day cash sale. */
  paid: number | null;
  debt: number | null;
};

/** What one member owes for one day on the sheet. */
export function dailyReceipt(
  row: DailySheetRow,
  date: string,
  columns: SheetColumn[] = [],
): Receipt {
  const lines: ReceiptLine[] = [];

  if (row.gymFeeMode === "subscription") {
    lines.push({ label: "Zal uchun to'lov", amount: null, note: "oylik" });
  } else if (row.gymFee > 0) {
    lines.push({ label: "Zal uchun to'lov", amount: row.gymFee });
  }

  for (const item of row.items) {
    lines.push({
      label: item.qty > 1 ? `${item.productName} x${item.qty}` : item.productName,
      amount: item.lineTotal,
    });
  }

  // The gym's own charges, labelled from settings. A column deleted since the
  // row was written has no name left to print, so it is folded into one line
  // rather than dropped: the receipt must still add up to what was charged.
  let unnamed = 0;
  for (const [columnId, extra] of Object.entries(row.extras ?? {})) {
    if (extra.amount <= 0) continue;
    const column = columns.find((c) => c.id === columnId);
    if (column) lines.push({ label: column.name, amount: extra.amount });
    else unnamed += extra.amount;
  }
  if (unnamed > 0) lines.push({ label: "Boshqa", amount: unnamed });

  const subtotal =
    (row.gymFeeMode === "cash" ? row.gymFee : 0) +
    row.items.reduce((s, i) => s + i.lineTotal, 0) +
    extrasTotal(row.extras);

  const meta: { label: string; value: string }[] = [];
  if (row.keyNumber !== null) {
    meta.push({ label: "Kalit", value: String(row.keyNumber) });
  }

  return {
    title: "KUNLIK CHEK",
    code: null,
    dateLabel: formatDateKey(date),
    clientName: row.clientName,
    meta,
    lines,
    subtotal,
    discount: row.discount,
    total: rowTotal(row),
    paid: null,
    debt: null,
  };
}

/** A tariff sale, with what has been paid against it so far. */
export function subscriptionReceipt(sub: Subscription, paid: number): Receipt {
  const discount = sub.originalPrice - sub.finalPrice;

  return {
    title: "KVITANSIYA",
    code: sub.code,
    dateLabel: sub.createdAt
      ? formatDateKey(timestampDay(sub.createdAt)!)
      : formatDateKey(sub.startDate),
    clientName: sub.clientName,
    meta: [
      {
        label: "Muddat",
        value: `${formatDateKey(sub.startDate)}${
          sub.endDate ? ` - ${formatDateKey(sub.endDate)}` : ""
        }`,
      },
    ],
    lines: [{ label: sub.tariffName, amount: sub.originalPrice }],
    subtotal: sub.originalPrice,
    discount,
    total: sub.finalPrice,
    paid,
    debt: computeDebt(sub.finalPrice, paid),
  };
}
