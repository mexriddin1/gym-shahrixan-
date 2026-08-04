/**
 * Groups payments by the day they were recorded.
 *
 *   npx tsx scripts/inspect-payments.mts
 *
 * Read-only. Shows both the UTC day and the Tashkent day, to expose payments
 * the report would file under the wrong date.
 */

import { collection, getDocs } from "firebase/firestore";

import { connect } from "./firebase-script-app.mjs";

const { db, target } = await connect();
console.log("target:", target, "\n");

const TZ = "Asia/Tashkent";
const localDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const snap = await getDocs(collection(db, "payments"));
const byDay = new Map<string, { count: number; total: number; utc: Set<string> }>();

let noDate = 0;
for (const d of snap.docs) {
  const p = d.data();
  const at = p.paidAt?.toDate?.();
  if (!at) {
    noDate++;
    continue;
  }
  const day = localDay(at);
  const cur = byDay.get(day) ?? { count: 0, total: 0, utc: new Set<string>() };
  cur.count++;
  cur.total += p.amount ?? 0;
  cur.utc.add(at.toISOString().slice(0, 10));
  byDay.set(day, cur);
}

console.log(`payments: ${snap.size} docs, ${noDate} without paidAt\n`);
for (const [day, v] of [...byDay.entries()].sort().reverse()) {
  const mismatch = v.utc.has(day) && v.utc.size === 1 ? "" : `  UTC=${[...v.utc].join(",")} <<`;
  console.log(
    `${day}  ${String(v.count).padStart(3)} payments  ${v.total.toLocaleString("en-US").padStart(12)}${mismatch}`,
  );
}

process.exit(0);
