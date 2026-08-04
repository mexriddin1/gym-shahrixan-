/**
 * Reports every entity's allocated codes against its counter.
 *
 *   npx tsx scripts/inspect-codes.mts
 *
 * Read-only. Diagnoses duplicate or skipped human-facing numbers.
 */

import { collection, doc, getDoc, getDocs } from "firebase/firestore";

import { connect } from "./firebase-script-app.mjs";

const { db, target } = await connect();
console.log("target:", target, "\n");

const ENTITIES = [
  ["clients", "clients"],
  ["tariffs", "tariffs"],
  ["products", "products"],
  ["subscriptions", "subscriptions"],
  ["payments", "payments"],
] as const;

for (const [collectionName, counterName] of ENTITIES) {
  const snap = await getDocs(collection(db, collectionName));
  const rows = snap.docs
    .map((d) => ({
      id: d.id,
      code: d.data().code as number | undefined,
      label:
        `${d.data().firstName ?? ""} ${d.data().lastName ?? ""}`.trim() ||
        (d.data().name as string) ||
        (d.data().clientName as string) ||
        "",
    }))
    .sort((a, b) => (a.code ?? 0) - (b.code ?? 0));

  const counterSnap = await getDoc(doc(db, "counters", counterName));
  const counter = counterSnap.exists()
    ? (counterSnap.data().value as number)
    : null;

  const codes = rows.map((r) => r.code).filter((c): c is number => c != null);
  const dupes = [...new Set(codes.filter((c, i) => codes.indexOf(c) !== i))];
  const max = codes.length > 0 ? Math.max(...codes) : null;

  console.log(`${collectionName}: ${rows.length} docs`);
  for (const r of rows) {
    console.log(`  ${String(r.code).padStart(6)}  ${r.label}  [${r.id}]`);
  }
  console.log(`  counter=${counter ?? "(missing)"}  max=${max ?? "-"}`);
  if (dupes.length > 0) console.log(`  DUPLICATE CODES: ${dupes.join(", ")}`);
  if (counter != null && max != null && counter < max) {
    console.log(`  COUNTER BEHIND by ${max - counter}`);
  }
  console.log();
}

process.exit(0);
