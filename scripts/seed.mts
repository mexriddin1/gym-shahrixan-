/**
 * Seeds Firestore from the workbook transcription in lib/db/seed-data.ts.
 *
 *   npm run seed
 *
 * Targets whatever .env.local points at (emulator or the live project).
 * Document ids are deterministic, so re-running overwrites rather than
 * duplicating.
 */

import { doc, serverTimestamp, writeBatch } from "firebase/firestore";

import {
  SEED_CLIENTS,
  SEED_PRODUCTS,
  SEED_SHEET_DATE,
  SEED_SHEET_ROWS,
  SEED_TARIFFS,
  seedRowItems,
} from "../lib/db/seed-data.js";
import { computeEndDate } from "../lib/domain/subscription.js";
import { COUNTER_START } from "../lib/db/collections.js";
import { connect } from "./firebase-script-app.mjs";

const { db, target } = await connect();
const ts = serverTimestamp();

// Firestore caps a batch at 500 writes, and this seed exceeds that.
let batch = writeBatch(db);
let pending = 0;
let total = 0;

async function put(path: string, data: Record<string, unknown>) {
  batch.set(doc(db, path), data);
  pending++;
  total++;
  if (pending >= 400) {
    await batch.commit();
    batch = writeBatch(db);
    pending = 0;
  }
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const tariffIds = new Map<string, string>();
for (const [i, t] of SEED_TARIFFS.entries()) {
  const id = `tariff-${slug(t.name)}`;
  tariffIds.set(t.name, id);
  await put(`tariffs/${id}`, {
    code: COUNTER_START.tariffs + i,
    name: t.name,
    description: null,
    price: t.price,
    durationDays: t.durationDays,
    visitLimit: t.visitLimit,
    weeklyLimit: null,
    allowedWeekdays: null,
    isVip: t.isVip,
    color: null,
    status: "active",
    createdBy: null,
    createdAt: ts,
    updatedAt: ts,
  });
}

const productIds = new Map<string, string>();
for (const [i, p] of SEED_PRODUCTS.entries()) {
  const id = `product-${slug(p.name)}`;
  productIds.set(p.name, id);
  await put(`products/${id}`, {
    code: COUNTER_START.products + i,
    name: p.name,
    category: null,
    barcode: null,
    costPrice: p.costPrice,
    sellPrice: p.sellPrice,
    qty: p.qty,
    minQty: p.minQty,
    unit: "dona",
    supplier: null,
    imageUrl: null,
    note: null,
    status: "active",
    createdBy: null,
    createdAt: ts,
    updatedAt: ts,
  });
}

const clientIdByKey = new Map<number, string>();
for (const [i, c] of SEED_CLIENTS.entries()) {
  const id = `client-${slug(`${c.firstName}-${c.lastName ?? ""}-${i}`)}`;
  if (c.keyNumber !== null && !clientIdByKey.has(c.keyNumber)) {
    clientIdByKey.set(c.keyNumber, id);
  }

  await put(`clients/${id}`, {
    code: COUNTER_START.clients + i,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    phone2: null,
    birthDate: null,
    gender: null,
    keyNumber: c.keyNumber,
    note: c.note ?? null,
    status: "active",
    createdBy: null,
    createdAt: ts,
    updatedAt: ts,
  });

  if (!c.tariff || !c.startDate) continue;
  const tariff = SEED_TARIFFS.find((t) => t.name === c.tariff)!;
  const subId = `sub-${id}`;
  const clientName = `${c.firstName} ${c.lastName ?? ""}`.trim();

  await put(`subscriptions/${subId}`, {
    code: COUNTER_START.subscriptions + i,
    clientId: id,
    clientName,
    tariffId: tariffIds.get(tariff.name)!,
    tariffName: tariff.name,
    originalPrice: tariff.price,
    discountType: "none",
    discountValue: 0,
    discountReason: null,
    finalPrice: tariff.price,
    durationDays: tariff.durationDays,
    visitLimit: tariff.visitLimit,
    weeklyLimit: null,
    allowedWeekdays: null,
    isVip: tariff.isVip,
    visitsUsed: 0,
    startDate: c.startDate,
    endDate: computeEndDate(c.startDate, tariff.durationDays),
    endDateManual: false,
    status: "active",
    note: null,
    createdBy: null,
    createdAt: ts,
    updatedAt: ts,
  });

  // Most members paid in full; every third is left part-paid so the debt and
  // payment screens have something real to show.
  await put(`payments/pay-${subId}`, {
    code: COUNTER_START.payments + i,
    clientId: id,
    clientName,
    subscriptionId: subId,
    orderId: null,
    amount: i % 3 === 0 ? Math.round(tariff.price / 2) : tariff.price,
    method: i % 4 === 0 ? "click" : "cash",
    note: "Tarif uchun boshlang'ich to'lov",
    // Dated to when the tariff was actually sold, not to when the seed ran.
    // Stamping every payment with `serverTimestamp()` piled all of them onto
    // one day, and the report then showed a single day earning the entire
    // membership's subscription income.
    paidAt: new Date(`${c.startDate}T10:00:00+05:00`),
    createdBy: null,
  });
}

await put(`daily_sheets/${SEED_SHEET_DATE}`, {
  date: SEED_SHEET_DATE,
  closedAt: null,
  createdAt: ts,
  updatedAt: ts,
});

for (const [i, row] of SEED_SHEET_ROWS.entries()) {
  const items = seedRowItems(row).map((item) => ({
    productId: productIds.get(item.productName)!,
    productName: item.productName,
    unitPrice: item.unitPrice,
    qty: item.qty,
    lineTotal: item.lineTotal,
  }));

  await put(
    `daily_sheets/${SEED_SHEET_DATE}/rows/row-${String(i + 1).padStart(3, "0")}`,
    {
      position: i + 1,
      clientId:
        row.clientKey !== null ? (clientIdByKey.get(row.clientKey) ?? null) : null,
      clientName: row.clientName,
      // The workbook's locker column, which is where the key belongs.
      keyNumber: row.clientKey,
      gymFeeMode: row.gymFeeMode,
      gymFee: row.gymFee,
      items,
      discount: 0,
      note: null,
      createdBy: null,
      createdAt: ts,
      updatedAt: ts,
    },
  );
}

await put("settings/app", {
  gymName: "Shahrixon Gym",
  phone: "933959292",
  address: null,
  expiryWarningDays: 3,
  receiptFooter: "Xaridingiz uchun rahmat!",
  updatedAt: ts,
});

// Counters must land past the highest seeded code so the app keeps counting up.
await put("counters/tariffs", {
  value: COUNTER_START.tariffs + SEED_TARIFFS.length - 1,
});
await put("counters/products", {
  value: COUNTER_START.products + SEED_PRODUCTS.length - 1,
});
await put("counters/clients", {
  value: COUNTER_START.clients + SEED_CLIENTS.length - 1,
});
await put("counters/subscriptions", {
  value: COUNTER_START.subscriptions + SEED_CLIENTS.length - 1,
});
await put("counters/payments", {
  value: COUNTER_START.payments + SEED_CLIENTS.length - 1,
});

await batch.commit();

console.log(
  `\nSeeded ${target}: ${total} documents.\n` +
    `  ${SEED_TARIFFS.length} tariffs, ${SEED_PRODUCTS.length} products, ` +
    `${SEED_CLIENTS.length} clients,\n  ${SEED_SHEET_ROWS.length} sheet rows for ${SEED_SHEET_DATE}.`,
);
process.exit(0);
