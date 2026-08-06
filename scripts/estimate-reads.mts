/**
 * Estimates Firestore reads per screen, from the real collection sizes.
 *
 *   npx tsx scripts/estimate-reads.mts
 *
 * Read-only. Firestore bills one read per document a query returns, and one
 * read for a query that returns nothing, so screen cost is driven by how big
 * the collections are rather than by how much of them is shown.
 */

import { collection, getDocs } from "firebase/firestore";

import { connect } from "./firebase-script-app.mjs";

const { db, target } = await connect();
console.log("target:", target, "\n");

const size = async (path: string) => (await getDocs(collection(db, path))).size;

const clients = await size("clients");
const products = await size("products");
const tariffs = await size("tariffs");
const subs = await size("subscriptions");
const payments = await size("payments");

const sheets = await getDocs(collection(db, "daily_sheets"));
let sheetRows = 0;
for (const d of sheets.docs) {
  sheetRows += (await getDocs(collection(db, "daily_sheets", d.id, "rows"))).size;
}
const rowsPerDay = sheets.size > 0 ? sheetRows / sheets.size : 0;

console.log("collection sizes");
console.log(`  clients        ${clients}`);
console.log(`  products       ${products}`);
console.log(`  tariffs        ${tariffs}`);
console.log(`  subscriptions  ${subs}`);
console.log(`  payments       ${payments}`);
console.log(`  daily sheets   ${sheets.size} (${sheetRows} rows, ~${rowsPerDay.toFixed(1)}/day)`);

// An empty day still costs one read, so a history window never bills less
// than the number of days it spans.
const history = (days: number) =>
  products + days * Math.max(1, Math.round(rowsPerDay));

const debtors = subs + payments;

const screens: [string, number][] = [
  ["/kunlik", 1 + Math.round(rowsPerDay) + products + clients + subs + 1],
  ["/mijozlar (a'zolar)", clients + subs + 1 + debtors],
  ["/mijozlar (kunlik tab)", clients + subs + 1 + debtors + history(60) + 1],
  ["/mijozlar/[id]", 1 + 3 + 1 + tariffs + payments + history(60) + 1],
  ["/obunalar", subs + clients + 1],
  ["/oylik", debtors + payments],
  ["/hisobot (14 kun)", history(14) + payments + subs + clients + debtors],
  ["/hisobot (92 kun)", history(92) + payments + subs + clients + debtors],
];

console.log("\nreads per page load");
for (const [name, reads] of screens) {
  console.log(`  ${name.padEnd(24)} ${String(reads).padStart(6)}`);
}

const FREE_READS = 50_000;
console.log(`\nfree tier: ${FREE_READS.toLocaleString()} reads/day`);
console.log("loads/day before hitting it");
for (const [name, reads] of screens) {
  console.log(
    `  ${name.padEnd(24)} ${String(Math.floor(FREE_READS / reads)).padStart(6)}`,
  );
}

process.exit(0);
