import {
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import {
  clientsRef,
  dailySheetDoc,
  dailySheetRowsRef,
  paymentsRef,
  productsRef,
  settingsDoc,
  staffRef,
  subscriptionsRef,
  tariffsRef,
} from "./collections";
import type {
  Client,
  DailySheet,
  DailySheetRow,
  DateKey,
  Payment,
  Product,
  Settings,
  SheetItem,
  Staff,
  Subscription,
  Tariff,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { computeDebt } from "@/lib/domain/pricing";
import { addDays, dateKey } from "@/lib/utils";

export async function getSettings(): Promise<Settings> {
  const snap = await getDoc(settingsDoc());
  if (!snap.exists()) {
    return { ...DEFAULT_SETTINGS, updatedAt: null as never };
  }
  const data = snap.data();
  // Settings saved before a field existed simply lack it, so the defaults are
  // filled in here rather than at every call site. Without this the type
  // promises an array that the document does not actually carry.
  return { ...DEFAULT_SETTINGS, ...data };
}

/*
 * A note on why these read whole collections and filter in memory.
 *
 * Combining a `where` with an `orderBy` on a different field forces a
 * composite index, and every one of those has to be created by hand in the
 * console before the screen works at all. For a gym with a few hundred members
 * and a dozen products that is a lot of operational ceremony to buy nothing:
 * the entire collection is smaller than one page of results elsewhere, and the
 * screens already hold it in memory to filter and search.
 *
 * The queries that stay server-side are the ones sorting on a single field,
 * which Firestore indexes automatically.
 *
 * This is a deliberate trade against scale. Past a few thousand documents it
 * should flip back to indexed queries with real pagination.
 */

export async function listClients(): Promise<Client[]> {
  const snap = await getDocs(clientsRef());
  return snap.docs
    .map((d) => d.data())
    .filter((c) => c.status !== "archived")
    .sort((a, b) => a.firstName.localeCompare(b.firstName, "uz"));
}

export async function getClient(id: string): Promise<Client | null> {
  const snap = await getDoc(doc(clientsRef(), id));
  return snap.exists() ? snap.data() : null;
}

export async function listActiveProducts(): Promise<Product[]> {
  const snap = await getDocs(productsRef());
  return snap.docs
    .map((d) => d.data())
    .filter((p) => p.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name, "uz"));
}

export async function listTariffs(): Promise<Tariff[]> {
  const snap = await getDocs(query(tariffsRef(), orderBy("price")));
  return snap.docs.map((d) => d.data());
}

export async function listActiveSubscriptions(): Promise<Subscription[]> {
  const snap = await getDocs(
    query(subscriptionsRef(), where("status", "==", "active")),
  );
  return snap.docs.map((d) => d.data());
}

export async function listPayments(): Promise<Payment[]> {
  const snap = await getDocs(
    query(paymentsRef(), orderBy("paidAt", "desc"), fbLimit(2000)),
  );
  return snap.docs.map((d) => d.data());
}

/**
 * Total unpaid across every non-cancelled subscription.
 *
 * Debt is derived, never stored, so this sums payments per subscription and
 * compares against the agreed final price. Cancelled subscriptions are
 * excluded: money is not owed on something that was called off.
 */
export async function getOutstandingDebt(): Promise<number> {
  const [subsSnap, payments] = await Promise.all([
    getDocs(subscriptionsRef()),
    listPayments(),
  ]);

  const paidBySubscription = new Map<string, number>();
  for (const p of payments) {
    if (!p.subscriptionId) continue;
    paidBySubscription.set(
      p.subscriptionId,
      (paidBySubscription.get(p.subscriptionId) ?? 0) + p.amount,
    );
  }

  let total = 0;
  for (const doc of subsSnap.docs) {
    const sub = doc.data();
    if (sub.status === "cancelled") continue;
    total += computeDebt(sub.finalPrice, paidBySubscription.get(sub.id) ?? 0);
  }
  return total;
}

export async function listSubscriptionsForClient(
  clientId: string,
): Promise<Subscription[]> {
  // Equality filter only, so this needs no composite index. Newest first is
  // applied here rather than by Firestore.
  const snap = await getDocs(
    query(subscriptionsRef(), where("clientId", "==", clientId)),
  );
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

export async function getSubscription(id: string): Promise<Subscription | null> {
  const snap = await getDoc(doc(subscriptionsRef(), id));
  return snap.exists() ? snap.data() : null;
}

export async function listAllSubscriptions(): Promise<Subscription[]> {
  const snap = await getDocs(
    query(subscriptionsRef(), orderBy("createdAt", "desc"), fbLimit(1000)),
  );
  return snap.docs.map((d) => d.data());
}

export type Debtor = {
  /** Only subscriptions carry debt now; product sales are settled on the sheet. */
  kind: "subscription";
  id: string;
  code: number;
  clientId: string | null;
  clientName: string;
  label: string;
  finalPrice: number;
  paid: number;
  debt: number;
  date: DateKey | null;
};

/**
 * Every subscription with money still owed on it.
 *
 * Debt is derived here rather than stored, so it cannot drift out of step with
 * the payments that back it. Cancelled subscriptions are excluded: nothing is
 * owed on something that was called off.
 */
export async function listDebtors(): Promise<Debtor[]> {
  const [subs, payments] = await Promise.all([
    listAllSubscriptions(),
    listPayments(),
  ]);

  const bySub = new Map<string, number>();
  for (const p of payments) {
    if (!p.subscriptionId) continue;
    bySub.set(p.subscriptionId, (bySub.get(p.subscriptionId) ?? 0) + p.amount);
  }

  const out: Debtor[] = [];
  for (const s of subs) {
    if (s.status === "cancelled") continue;
    const paid = bySub.get(s.id) ?? 0;
    const debt = computeDebt(s.finalPrice, paid);
    if (debt <= 0) continue;
    out.push({
      kind: "subscription",
      id: s.id,
      code: s.code,
      clientId: s.clientId,
      clientName: s.clientName,
      label: s.tariffName,
      finalPrice: s.finalPrice,
      paid,
      debt,
      date: s.startDate,
    });
  }

  return out.sort((a, b) => b.debt - a.debt);
}

export async function listStaff(): Promise<Staff[]> {
  const snap = await getDocs(staffRef());
  return snap.docs.map((d) => d.data());
}

/** Every member, archived ones included. Only the members screen wants these. */
export async function listAllClients(): Promise<Client[]> {
  const snap = await getDocs(clientsRef());
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => a.firstName.localeCompare(b.firstName, "uz"));
}

/* --------------------------- daily sheet --------------------------- */

export type DailySheetData = {
  sheet: DailySheet | null;
  rows: DailySheetRow[];
  products: Product[];
};

/**
 * Brings a row written under the old column-based shape up to date.
 *
 * Rows used to store `charges` as a productId-to-amount map, back when every
 * product was a column. Normalising on read means the sheet keeps working on
 * days recorded before the change, with no migration script to run.
 */
function normaliseRow(row: DailySheetRow, products: Product[]): DailySheetRow {
  if (Array.isArray(row.items)) {
    return {
      ...row,
      discount: row.discount ?? 0,
      // Lines written before they were individually identifiable fall back to
      // the product id, which was unique per row under the old rules.
      items: row.items.map((i) => ({ ...i, lineId: i.lineId ?? i.productId })),
    };
  }

  const legacy = (row as unknown as { charges?: Record<string, number> }).charges;
  const byId = new Map(products.map((p) => [p.id, p]));
  const items: SheetItem[] = Object.entries(legacy ?? {})
    .filter(([, amount]) => amount > 0)
    .map(([productId, amount]) => ({
      lineId: productId,
      productId,
      productName: byId.get(productId)?.name ?? "Mahsulot",
      // The old shape recorded a total, not a unit price and a quantity, so
      // the honest reconstruction is a single line at that amount.
      unitPrice: amount,
      qty: 1,
      lineTotal: amount,
    }));

  return { ...row, items, discount: row.discount ?? 0 };
}

/**
 * Sheet order: by position, oldest first where two rows share one.
 *
 * Firestore breaks a tie on `position` with the document id, which is random,
 * so a duplicated position could seat a new arrival above someone who was
 * already there. Falling back to creation time keeps the sheet in the order the
 * desk actually wrote it, and repairs the display for days recorded before
 * positions were allocated safely.
 */
function bySheetOrder(a: DailySheetRow, b: DailySheetRow): number {
  if (a.position !== b.position) return a.position - b.position;
  return (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0);
}

/**
 * One day of the tracking sheet.
 *
 * A day that has never been opened returns `sheet: null` rather than throwing,
 * so the screen can offer to start it instead of showing an error.
 */
export async function getDailySheet(date: DateKey): Promise<DailySheetData> {
  const [sheetSnap, rowsSnap, products] = await Promise.all([
    getDoc(dailySheetDoc(date)),
    getDocs(query(dailySheetRowsRef(date), orderBy("position"))),
    listActiveProducts(),
  ]);

  return {
    sheet: sheetSnap.exists() ? sheetSnap.data() : null,
    rows: rowsSnap.docs.map((d) => normaliseRow(d.data(), products)).sort(bySheetOrder),
    products,
  };
}

/**
 * Sheet rows for several days at once, keyed by date.
 *
 * Reports read a month at a time. Calling `getDailySheet` per day would refetch
 * the whole product catalogue with every one of them, which turned a 30 day
 * report into ninety round trips and made the range selector look broken.
 * Products are resolved once here and rows fetched per day.
 */
export async function getSheetRowsForDates(
  dates: DateKey[],
): Promise<{ rows: Map<DateKey, DailySheetRow[]>; products: Product[] }> {
  const products = await listActiveProducts();

  const entries = await Promise.all(
    dates.map(async (date) => {
      const snap = await getDocs(
        query(dailySheetRowsRef(date), orderBy("position")),
      );
      const rows = snap.docs.map((d) => normaliseRow(d.data(), products));
      return [date, rows.sort(bySheetOrder)] as const;
    }),
  );

  return { rows: new Map(entries), products };
}

export type SheetHistoryDay = { date: DateKey; rows: DailySheetRow[] };

/**
 * Recent days of the sheet, newest first.
 *
 * Backs both the walk-in list and a member's purchase history. Firestore could
 * answer "every row for this member" with a collection group query, but that
 * needs an index created by hand in the console for every deployment; scanning
 * a fixed window of days needs none and is fast enough at a gym's volume.
 */
export async function getSheetHistory(days = 30): Promise<SheetHistoryDay[]> {
  const today = dateKey();
  const dates = Array.from({ length: days }, (_, i) => addDays(today, -i));
  const { rows } = await getSheetRowsForDates(dates);
  return dates.map((date) => ({ date, rows: rows.get(date) ?? [] }));
}

/** Days that already have a sheet, newest first, for the day tabs. */
export async function listSheetDates(max = 14): Promise<DateKey[]> {
  const { dailySheetsRef } = await import("./collections");
  const snap = await getDocs(
    query(dailySheetsRef(), orderBy("date", "desc"), fbLimit(max)),
  );
  return snap.docs.map((d) => d.id);
}
