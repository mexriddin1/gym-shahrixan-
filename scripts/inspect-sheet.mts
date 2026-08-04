/**
 * Dumps the stored `position` of every row on recent daily sheets.
 *
 *   npx tsx scripts/inspect-sheet.mts
 *
 * Read-only. Diagnoses the № column being out of order or repeating.
 */

import { collection, getDocs, orderBy, query } from "firebase/firestore";

import { connect } from "./firebase-script-app.mjs";

const { db, target } = await connect();
console.log("target:", target, "\n");

const sheets = await getDocs(collection(db, "daily_sheets"));
const dates = sheets.docs.map((d) => d.id).sort().reverse().slice(0, 5);

for (const date of dates) {
  const snap = await getDocs(
    query(collection(db, "daily_sheets", date, "rows"), orderBy("position")),
  );

  console.log(`${date}: ${snap.size} rows`);
  const positions: number[] = [];
  snap.docs.forEach((d, i) => {
    const r = d.data();
    positions.push(r.position);
    const flag = r.position === i + 1 ? "  " : "<<";
    console.log(
      `  shown №${String(i + 1).padStart(2, "0")}  position=${String(r.position).padStart(3)} ${flag} ${r.clientName}`,
    );
  });

  const dupes = [...new Set(positions.filter((p, i) => positions.indexOf(p) !== i))];
  if (dupes.length > 0) console.log(`  DUPLICATE positions: ${dupes.join(", ")}`);
  const gaps = positions.filter((p, i) => i > 0 && p !== positions[i - 1] + 1);
  if (gaps.length > 0) console.log(`  GAPS before: ${gaps.join(", ")}`);
  console.log();
}

process.exit(0);
