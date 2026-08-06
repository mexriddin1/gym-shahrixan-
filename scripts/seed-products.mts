/**
 * Adds the gym's product catalogue.
 *
 *   npx tsx scripts/seed-products.mts
 *
 * Document ids are derived from the name, so re-running updates the same
 * products instead of piling up duplicates.
 *
 * Stock stays at 0: quantity only ever moves through a signed stock_movement,
 * so opening stock is recorded from the Ombor screen rather than written here.
 * `costPrice` is 0 too, because only sell prices were supplied — set it in
 * Ombor before trusting any profit figure.
 */

import { doc, serverTimestamp, writeBatch } from "firebase/firestore";

import { COUNTER_START } from "../lib/db/collections.js";
import { connect } from "./firebase-script-app.mjs";

const CATALOGUE: { category: string; items: [name: string, price: number][] }[] =
  [
    {
      category: "Sport qo'shimchalari",
      items: [
        ["Protein", 30_000],
        ["Kreatin", 15_000],
        ["Pump", 15_000],
        ["L-Arginin", 15_000],
      ],
    },
    {
      category: "Oziq-ovqat",
      items: [
        ["Ovqat", 35_000],
        ["Tvorog", 10_000],
        ["Sut", 10_000],
        ["Snickers", 10_000],
      ],
    },
    {
      category: "Ichimliklar",
      items: [
        ["Sharbat", 20_000],
        ["Apelsin sharbati", 30_000],
        ["Coca-Cola", 10_000],
        ["Pepsi", 10_000],
        ["Fanta", 10_000],
        ["Gorilla", 15_000],
      ],
    },
  ];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const { db, target } = await connect();
const ts = serverTimestamp();
const batch = writeBatch(db);

const flat = CATALOGUE.flatMap((group) =>
  group.items.map(([name, sellPrice]) => ({
    name,
    sellPrice,
    category: group.category,
  })),
);

for (const [i, p] of flat.entries()) {
  const code = COUNTER_START.products + i;
  batch.set(doc(db, `products/product-${slug(p.name)}`), {
    code,
    name: p.name,
    category: p.category,
    barcode: null,
    costPrice: 0,
    sellPrice: p.sellPrice,
    qty: 0,
    minQty: 0,
    unit: "dona",
    supplier: null,
    imageUrl: null,
    note: null,
    status: "active",
    createdBy: null,
    createdAt: ts,
    updatedAt: ts,
  });
  console.log(
    `  ${String(code)}  ${p.name.padEnd(20)} ${p.sellPrice.toLocaleString("ru-RU").padStart(8)}  ${p.category}`,
  );
}

// The counter must land on the highest code written, so the next product the
// app creates continues from here instead of colliding.
batch.set(
  doc(db, "counters/products"),
  { value: COUNTER_START.products + flat.length - 1 },
  { merge: true },
);

await batch.commit();

console.log(`\n${flat.length} products written to ${target}.`);
console.log(`counters/products = ${COUNTER_START.products + flat.length - 1}`);
process.exit(0);
