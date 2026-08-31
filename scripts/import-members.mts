/**
 * Replaces the member list with the August 2026 sheet.
 *
 *   npx tsx scripts/import-members.mts         # dry run: prints, writes nothing
 *   npx tsx scripts/import-members.mts --yes   # deletes and imports
 *
 * Targets whatever .env.local points at. There is NO undo: clients,
 * subscriptions and payments are all removed before the import runs, so the
 * dry run is the only chance to read what is about to happen.
 *
 * What it does, in order:
 *   0. writes everything it is about to delete to a JSON file, so the wipe
 *      can be undone by hand if the sheet turns out to have been wrong
 *   1. deletes every clients/, subscriptions/ and payments/ document
 *   2. writes one client per "+" row, deduplicated by name
 *   3. for a row that also carried a price, writes the 1 month subscription
 *      and the payment that settled it
 *   4. resets the three counters so the next code carries on from the import
 *
 * Rows without a "+" are not members as of this sheet and are skipped. Rows
 * with a "+" but no price become a member with no subscription: the sheet does
 * not say what they were charged, and inventing a figure would put a number in
 * the books that nobody agreed to.
 */

import { writeFileSync } from "node:fs";
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { COUNTER_START } from "../lib/db/collections.js";
import { normalisePersonName } from "../lib/domain/names.js";
import { connect } from "./firebase-script-app.mjs";
import { parseAll, type ParsedMember } from "./parse-members.mjs";

const apply = process.argv.includes("--yes");

/** The tariff every row on this sheet is on. */
const TARIFF_NAME = "1 oy";

/** Money the desk recorded as a part payment, pulled back out of `leftovers`. */
function partPayment(row: ParsedMember): number | null {
  for (const note of row.leftovers) {
    const m = /^qisman to'lov: (\d+)$/.exec(note);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * Noon Tashkent on the given day.
 *
 * A payment is stored as an instant but reported against a calendar day, and
 * `timestampDay` reads that day in Asia/Tashkent. Midnight UTC would fall on
 * the previous day locally and file every payment against the day before.
 */
function atNoon(dateKey: string): Timestamp {
  return Timestamp.fromDate(new Date(`${dateKey}T12:00:00+05:00`));
}

/* ------------------------------ plan ------------------------------ */

type PlannedMember = {
  name: string;
  phone: string | null;
  /** Every priced row for this person, in sheet order. */
  subscriptions: {
    price: number;
    paid: number;
    startDate: string;
    endDate: string;
    method: "cash" | "click";
  }[];
  /** Sheet row numbers this member was built from, for the printout. */
  rows: (number | null)[];
};

const parsed = parseAll();
const kept = parsed.filter((m) => m.paid);

/*
 * Deduplicated by the stored spelling of the name.
 *
 * The sheet lists one person twice when they renewed inside the month. That is
 * one member with two subscriptions, not two members - and importing it as two
 * would leave the desk with a duplicate to merge by hand on day one.
 */
const byName = new Map<string, PlannedMember>();
for (const row of kept) {
  const name = normalisePersonName(row.name);
  const existing = byName.get(name);
  const member: PlannedMember = existing ?? {
    name,
    phone: row.phone,
    subscriptions: [],
    rows: [],
  };
  // A later row's phone fills a gap but never overwrites one already found.
  if (!member.phone && row.phone) member.phone = row.phone;
  member.rows.push(row.no);

  if (row.price !== null && row.startDate && row.endDate) {
    member.subscriptions.push({
      price: row.price,
      paid: partPayment(row) ?? row.price,
      startDate: row.startDate,
      endDate: row.endDate,
      method: row.method,
    });
  }
  byName.set(name, member);
}

const members = [...byName.values()];
const subscriptionCount = members.reduce((n, m) => n + m.subscriptions.length, 0);
const membersWithout = members.filter((m) => m.subscriptions.length === 0);
const partPayments = kept.filter((r) => partPayment(r) !== null);
const merged = members.filter((m) => m.rows.length > 1);

/* ----------------------------- report ----------------------------- */

const { db, target } = await connect();

console.log(`\ntarget: ${target}   (${apply ? "WRITING" : "dry run"})\n`);

async function count(db: Firestore, name: string): Promise<number> {
  return (await getDocs(collection(db, name))).size;
}

const before = {
  clients: await count(db, "clients"),
  subscriptions: await count(db, "subscriptions"),
  payments: await count(db, "payments"),
};

console.log("o'chiriladi:");
console.log(`  clients         ${String(before.clients).padStart(5)}`);
console.log(`  subscriptions   ${String(before.subscriptions).padStart(5)}`);
console.log(`  payments        ${String(before.payments).padStart(5)}`);
console.log("");
console.log("qo'shiladi:");
console.log(`  clients         ${String(members.length).padStart(5)}`);
console.log(`  subscriptions   ${String(subscriptionCount).padStart(5)}`);
console.log(`  payments        ${String(subscriptionCount).padStart(5)}`);
console.log("");
console.log(`  varaqadagi "+" satr:        ${kept.length}`);
console.log(`  abonementsiz (narxi yo'q):  ${membersWithout.length}`);
console.log(`  birlashtirilgan takror:     ${merged.length}`);
console.log(`  qisman to'lov:              ${partPayments.length}`);
console.log("");

if (merged.length) {
  for (const m of merged) {
    console.log(`  birlashdi: ${m.name}  (satr ${m.rows.join(", ")})`);
  }
  console.log("");
}
for (const r of partPayments) {
  console.log(
    `  qisman:    ${normalisePersonName(r.name)}  narx ${r.price}  to'langan ${partPayment(r)}`,
  );
}
if (partPayments.length) console.log("");

if (!apply) {
  console.log("Hech narsa yozilmadi. Yozish uchun: --yes\n");
  process.exit(0);
}

/* ---------------------------- backup ------------------------------ */

/*
 * Everything about to be destroyed, on disk first.
 *
 * There is no undo in Firestore and no snapshot on this project, so without
 * this the only copy of forty-eight members and their payment history is the
 * one being deleted. Written before the first delete rather than alongside it,
 * so a failure part way through still leaves a complete copy.
 */
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupPath = `backup-${stamp}.json`;

const backup: Record<string, Record<string, unknown>[]> = {};
for (const name of ["clients", "subscriptions", "payments"]) {
  const snap = await getDocs(collection(db, name));
  backup[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf8");
console.log(
  `zaxira: ${backupPath}  (clients ${backup.clients.length}, ` +
    `subscriptions ${backup.subscriptions.length}, payments ${backup.payments.length})`,
);
console.log("");

/* ----------------------------- write ------------------------------ */

/** Firestore caps a batch at 500 writes; this runs well past that. */
let batch = writeBatch(db);
let pending = 0;

async function flush(force = false) {
  if (pending === 0) return;
  if (!force && pending < 400) return;
  await batch.commit();
  batch = writeBatch(db);
  pending = 0;
}

async function put(path: string, data: Record<string, unknown>) {
  batch.set(doc(db, path), data);
  pending++;
  await flush();
}

async function drop(path: string, id: string) {
  batch.delete(doc(db, path, id));
  pending++;
  await flush();
}

for (const name of ["payments", "subscriptions", "clients"]) {
  const snap = await getDocs(collection(db, name));
  for (const d of snap.docs) await drop(name, d.id);
  console.log(`o'chirildi: ${name} (${snap.size})`);
}
await flush(true);

const ts = serverTimestamp();
let clientCode = COUNTER_START.clients;
let subCode = COUNTER_START.subscriptions;
let payCode = COUNTER_START.payments;

for (const member of members) {
  const clientId = doc(collection(db, "clients")).id;

  await put(`clients/${clientId}`, {
    code: clientCode++,
    // The whole string as the sheet wrote it, bracketed note included. That
    // note is how the desk tells two people of the same name apart, so it is
    // part of the name here rather than something to tidy away.
    firstName: member.name,
    lastName: null,
    phone: member.phone,
    phone2: null,
    birthDate: null,
    gender: null,
    keyNumber: null,
    note: null,
    status: "active",
    createdBy: null,
    createdAt: ts,
    updatedAt: ts,
  });

  for (const sub of member.subscriptions) {
    const subId = doc(collection(db, "subscriptions")).id;

    await put(`subscriptions/${subId}`, {
      code: subCode++,
      clientId,
      clientName: member.name,
      // No tariff template is pointed at: the sheet's "1 OY" is a description,
      // not one of the tariffs configured in Sozlamalar, and inventing a link
      // would let a later tariff edit look like it changed a past sale.
      tariffId: null,
      tariffName: TARIFF_NAME,
      originalPrice: sub.price,
      discountType: "none",
      discountValue: 0,
      discountReason: null,
      finalPrice: sub.price,
      durationDays: 30,
      visitLimit: null,
      weeklyLimit: null,
      allowedWeekdays: null,
      isVip: false,
      visitsUsed: 0,
      startDate: sub.startDate,
      endDate: sub.endDate,
      // The end date came off the sheet rather than being computed from the
      // start, so it is a manual one and must not be recalculated.
      endDateManual: true,
      status: "active",
      note: null,
      createdBy: null,
      createdAt: ts,
      updatedAt: ts,
    });

    await put(`payments/${doc(collection(db, "payments")).id}`, {
      code: payCode++,
      clientId,
      clientName: member.name,
      subscriptionId: subId,
      orderId: null,
      amount: sub.paid,
      method: sub.method,
      note: null,
      paidAt: atNoon(sub.startDate),
      createdBy: null,
    });
  }
}

// Counters hold the LAST allocated code, so they are set one below the next.
await put("counters/clients", { value: clientCode - 1 });
await put("counters/subscriptions", { value: subCode - 1 });
await put("counters/payments", { value: payCode - 1 });

await put(`audit_log/${doc(collection(db, "audit_log")).id}`, {
  actorId: null,
  actorEmail: null,
  action: "create",
  entity: "client",
  entityId: null,
  before: {
    clients: before.clients,
    subscriptions: before.subscriptions,
    payments: before.payments,
  },
  after: {
    clients: members.length,
    subscriptions: subscriptionCount,
    payments: subscriptionCount,
  },
  // One entry for the whole import rather than 400. The audit log exists so a
  // figure can be traced back to who changed it; a bulk replacement is one act.
  reason: "2026-08 varaqasidan mijozlar qayta yuklandi (import-members.mts)",
  createdAt: ts,
});

await flush(true);

console.log("");
console.log(`qo'shildi: clients ${members.length}`);
console.log(`qo'shildi: subscriptions ${subscriptionCount}`);
console.log(`qo'shildi: payments ${subscriptionCount}`);
console.log("Tayyor.\n");
process.exit(0);
