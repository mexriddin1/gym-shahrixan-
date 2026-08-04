import type { SheetHistoryDay } from "@/lib/db/queries";
import type { DailySheetRow, DateKey, SheetColumn } from "@/lib/db/types";
import { rowCollected, rowTotal } from "@/lib/db/types";

/**
 * The identity of a walk-in.
 *
 * Walk-ins have no member record, so the name written on the sheet is all
 * there is to go on. Two rows with the same name are the same person: someone
 * who comes in on Monday and again on Thursday is one visitor with two
 * visits, not two visitors. Case and stray spacing are ignored so "ali  Karimov"
 * and "Ali Karimov" do not split into separate people.
 */
export function walkInKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export type WalkInVisit = {
  date: DateKey;
  gymFee: number;
  onSubscription: boolean;
  items: { name: string; qty: number; total: number; paid: boolean }[];
  /** Amounts recorded against the gym's own columns, resolved to their names. */
  extras: { name: string; total: number; paid: boolean }[];
  total: number;
  owed: number;
};

export type WalkIn = {
  key: string;
  /** The most recent spelling, since that is the one the desk last typed. */
  name: string;
  visits: WalkInVisit[];
  lastVisit: DateKey;
  firstVisit: DateKey;
  spent: number;
  owed: number;
};

/**
 * Turns one row of a daily sheet into what was bought on it.
 *
 * `columns` names the gym's own charges. A column deleted since the row was
 * written has no name left, so its amount is shown as "Boshqa" rather than
 * dropped: the chips have to account for the row total.
 */
export function visitFromRow(
  date: DateKey,
  row: DailySheetRow,
  columns: SheetColumn[] = [],
): WalkInVisit {
  const total = rowTotal(row);

  const extras: WalkInVisit["extras"] = [];
  for (const [columnId, extra] of Object.entries(row.extras ?? {})) {
    if (extra.amount <= 0) continue;
    extras.push({
      name: columns.find((c) => c.id === columnId)?.name ?? "Boshqa",
      total: extra.amount,
      paid: !!extra.paid,
    });
  }

  return {
    date,
    gymFee: row.gymFeeMode === "cash" ? row.gymFee : 0,
    onSubscription: row.gymFeeMode === "subscription",
    items: row.items.map((i) => ({
      name: i.productName,
      qty: i.qty,
      total: i.lineTotal,
      paid: !!i.paid,
    })),
    extras,
    total,
    owed: Math.max(0, total - rowCollected(row)),
  };
}

/**
 * Every walk-in in a window of daily sheets, grouped into one entry per person.
 *
 * `history` is expected newest first, which is how `getSheetHistory` returns it,
 * so the first name seen for a key is also the most recent spelling.
 */
export function collectWalkIns(
  history: SheetHistoryDay[],
  columns: SheetColumn[] = [],
): WalkIn[] {
  const byKey = new Map<string, WalkIn>();

  for (const day of history) {
    for (const row of day.rows) {
      if (row.clientId !== null) continue;
      const key = walkInKey(row.clientName);
      if (!key) continue;

      const visit = visitFromRow(day.date, row, columns);
      const existing = byKey.get(key);

      if (!existing) {
        byKey.set(key, {
          key,
          name: row.clientName.trim().replace(/\s+/g, " "),
          visits: [visit],
          lastVisit: day.date,
          firstVisit: day.date,
          spent: visit.total,
          owed: visit.owed,
        });
        continue;
      }

      existing.visits.push(visit);
      existing.spent += visit.total;
      existing.owed += visit.owed;
      if (day.date < existing.firstVisit) existing.firstVisit = day.date;
      if (day.date > existing.lastVisit) existing.lastVisit = day.date;
    }
  }

  return [...byKey.values()].sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
}
