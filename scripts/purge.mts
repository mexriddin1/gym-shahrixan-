/**
 * Wipes the project's data, keeping only `staff` so the desk can still be
 * signed into.
 *
 *   npx tsx scripts/purge.mts              # dry run: counts only, deletes nothing
 *   npx tsx scripts/purge.mts --yes        # actually deletes
 *
 * Targets whatever .env.local points at. There is no undo and no backup: run
 * the dry run first and read the counts.
 *
 * `audit_log` is append-only in firestore.rules (`allow update, delete: if
 * false`), so a client-SDK delete is refused by the server. The script reports
 * that rather than pretending it worked; clearing it needs either a rules
 * change or `firebase firestore:delete --recursive audit_log`.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { connect } from "./firebase-script-app.mjs";

const KEEP = "staff";

/** Everything the rules expose, minus the one collection that stays. */
const COLLECTIONS = [
  "clients",
  "tariffs",
  "subscriptions",
  "payments",
  "visits",
  "products",
  "stock_movements",
  "orders",
  "subscription_freezes",
  "audit_log",
];

const COUNTERS = [
  "clients",
  "tariffs",
  "subscriptions",
  "payments",
  "visits",
  "products",
  "stock_movements",
  "orders",
];

const apply = process.argv.includes("--yes");

const { db, target } = await connect();
console.log(`\ntarget: ${target}  (${apply ? "DELETING" : "dry run"})`);
console.log(`keeping: ${KEEP}\n`);

/** Firestore caps a batch at 500 writes. */
async function deleteCollection(db: Firestore, path: string): Promise<number> {
  const snap = await getDocs(collection(db, path));
  if (!apply || snap.empty) return snap.size;

  for (let i = 0; i < snap.docs.length; i += 500) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + 500)) batch.delete(d.ref);
    await batch.commit();
  }
  return snap.size;
}

const failed: string[] = [];
let total = 0;

for (const name of COLLECTIONS) {
  try {
    const n = await deleteCollection(db, name);
    total += n;
    console.log(`  ${name.padEnd(22)} ${String(n).padStart(6)}`);
  } catch (error) {
    failed.push(name);
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  ${name.padEnd(22)} ${"FAILED".padStart(6)}  ${message}`);
  }
}

// daily_sheets/{date}/rows/{rowId} — subcollections are not removed with their
// parent, so the rows go first and the sheet document after them.
const sheets = await getDocs(collection(db, "daily_sheets"));
let sheetRows = 0;
for (const sheet of sheets.docs) {
  sheetRows += await deleteCollection(db, `daily_sheets/${sheet.id}/rows`);
  if (apply) await deleteDoc(sheet.ref);
}
total += sheets.size + sheetRows;
console.log(
  `  ${"daily_sheets".padEnd(22)} ${String(sheets.size).padStart(6)}  (+${sheetRows} rows)`,
);

// settings/app falls back to DEFAULT_SETTINGS when missing, so removing it
// resets the desk to defaults rather than breaking it.
if (apply) await deleteDoc(doc(db, "settings", "app"));
console.log(`  ${"settings/app".padEnd(22)} ${String(1).padStart(6)}`);

// Counters hold the last allocated human-facing code. Dropping them restarts
// numbering from COUNTER_START, which is what a fresh database wants.
if (apply) {
  for (const name of COUNTERS) await deleteDoc(doc(db, "counters", name));
}
console.log(`  ${"counters".padEnd(22)} ${String(COUNTERS.length).padStart(6)}`);

const kept = await getDocs(collection(db, KEEP));
console.log(`\n${KEEP} left untouched: ${kept.size} document(s)`);
for (const d of kept.docs) {
  console.log(`  ${d.id}  ${d.data().email ?? ""}  ${d.data().role ?? ""}`);
}

console.log(
  apply
    ? `\nDeleted ~${total + 1 + COUNTERS.length} documents.`
    : `\nDry run. ~${total + 1 + COUNTERS.length} documents would be deleted. Re-run with --yes.`,
);

if (failed.length > 0) {
  console.log(`\nNOT deleted (rules refused): ${failed.join(", ")}`);
}

process.exit(0);
