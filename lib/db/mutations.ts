import {
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import {
  clientsRef,
  db,
  paymentsRef,
  productsRef,
  subscriptionsRef,
  tariffsRef,
} from "./collections";
import { allocateCode, now, writeAudit, type Actor } from "./write";
import type {
  Client,
  ClientStatus,
  Gender,
  Product,
  Tariff,
} from "./types";

export type ClientInput = {
  firstName: string;
  lastName: string | null;
  phone: string | null;
  phone2: string | null;
  birthDate: string | null;
  gender: Gender | null;
  keyNumber: number | null;
  note: string | null;
  status: ClientStatus;
};

/**
 * Creates a client with the next sequential code.
 *
 * The code allocation and the document write share one transaction, so two
 * staff registering members at the same time cannot land on the same number.
 */
export async function createClient(
  input: ClientInput,
  actor: Actor,
): Promise<string> {
  const ref = doc(clientsRef());

  await runTransaction(db(), async (tx) => {
    // Read before write: Firestore transactions require it.
    const code = await allocateCode(tx, "clients");
    tx.set(ref, {
      ...input,
      code,
      createdBy: actor?.id ?? null,
      createdAt: now(),
      updatedAt: now(),
    } as never);
  });

  writeAudit({
    actor,
    action: "create",
    entity: "client",
    entityId: ref.id,
    after: { name: `${input.firstName} ${input.lastName ?? ""}`.trim() },
  });

  return ref.id;
}

export async function updateClient(
  id: string,
  input: ClientInput,
  before: Client,
  actor: Actor,
): Promise<void> {
  await updateDoc(doc(clientsRef(), id), { ...input, updatedAt: now() });

  writeAudit({
    actor,
    action: "update",
    entity: "client",
    entityId: id,
    before: { name: `${before.firstName} ${before.lastName ?? ""}`.trim(), status: before.status },
    after: { name: `${input.firstName} ${input.lastName ?? ""}`.trim(), status: input.status },
  });
}

/**
 * Moves a member in or out of the archive.
 *
 * Archiving is for someone who has stopped coming but whose history is worth
 * keeping. They drop out of the working lists and stop appearing in expiry
 * reminders, without anything being destroyed.
 */
export async function setClientArchived(
  id: string,
  archived: boolean,
  before: Client,
  actor: Actor,
): Promise<void> {
  await updateDoc(doc(clientsRef(), id), {
    status: archived ? "archived" : "active",
    updatedAt: now(),
  });
  writeAudit({
    actor,
    action: archived ? "delete" : "restore",
    entity: "client",
    entityId: id,
    before: { status: before.status },
    after: { status: archived ? "archived" : "active" },
  });
}

/**
 * Removes a member, and optionally everything sold to them.
 *
 * The default leaves subscriptions and payments in place. That is deliberate:
 * money the gym took is part of the books whether or not the member is still
 * on the list, and a report covering last month should not change because
 * somebody was tidied off the roster today.
 *
 * `withRecords` is for the other case - a member entered twice, or by mistake,
 * whose sales were never real. Then the records have to go too, or they sit
 * there forever attached to a member id that no longer resolves to anyone.
 */
export async function deleteClient(
  id: string,
  before: Client,
  actor: Actor,
  options: { withRecords: boolean } = { withRecords: false },
): Promise<{ subscriptions: number; payments: number }> {
  let removed = { subscriptions: 0, payments: 0 };

  if (options.withRecords) {
    const [subs, payments] = await Promise.all([
      getDocs(query(subscriptionsRef(), where("clientId", "==", id))),
      getDocs(query(paymentsRef(), where("clientId", "==", id))),
    ]);

    // One batch, so a member is never left half-deleted with some of their
    // sales gone and the rest orphaned.
    const batch = writeBatch(db());
    for (const d of subs.docs) batch.delete(d.ref);
    for (const d of payments.docs) batch.delete(d.ref);
    batch.delete(doc(clientsRef(), id));
    await batch.commit();

    removed = { subscriptions: subs.size, payments: payments.size };
  } else {
    await deleteDoc(doc(clientsRef(), id));
  }

  writeAudit({
    actor,
    action: "delete",
    entity: "client",
    entityId: id,
    before: {
      name: `${before.firstName} ${before.lastName ?? ""}`.trim(),
      code: before.code,
      ...(options.withRecords ? { removed } : {}),
    },
  });

  return removed;
}

export type TariffInput = {
  name: string;
  description: string | null;
  price: number;
  durationDays: number | null;
  visitLimit: number | null;
  weeklyLimit: number | null;
  allowedWeekdays: number[] | null;
  isVip: boolean;
  color: string | null;
  status: "active" | "archived";
};

export async function createTariff(
  input: TariffInput,
  actor: Actor,
): Promise<string> {
  const ref = doc(tariffsRef());

  await runTransaction(db(), async (tx) => {
    const code = await allocateCode(tx, "tariffs");
    tx.set(ref, {
      ...input,
      code,
      createdBy: actor?.id ?? null,
      createdAt: now(),
      updatedAt: now(),
    } as never);
  });

  writeAudit({
    actor,
    action: "create",
    entity: "tariff",
    entityId: ref.id,
    after: { name: input.name, price: input.price },
  });

  return ref.id;
}

/**
 * Editing a tariff only changes the template. Subscriptions already sold keep
 * the terms snapshotted at sale time, so no past sale is rewritten by this.
 */
export async function updateTariff(
  id: string,
  input: TariffInput,
  before: Tariff,
  actor: Actor,
): Promise<void> {
  await updateDoc(doc(tariffsRef(), id), { ...input, updatedAt: now() });

  writeAudit({
    actor,
    action: "update",
    entity: "tariff",
    entityId: id,
    before: { name: before.name, price: before.price },
    after: { name: input.name, price: input.price },
  });
}

/**
 * Deletes the tariff template.
 *
 * Safe to do outright: subscriptions snapshot the name and price at sale time,
 * so removing the template cannot change what a member was charged or what a
 * past receipt says.
 */
export async function deleteTariff(
  id: string,
  before: Tariff,
  actor: Actor,
): Promise<void> {
  await deleteDoc(doc(tariffsRef(), id));
  writeAudit({
    actor,
    action: "delete",
    entity: "tariff",
    entityId: id,
    before: { name: before.name, price: before.price },
  });
}

export type ProductInput = {
  name: string;
  category: string | null;
  barcode: string | null;
  costPrice: number;
  sellPrice: number;
  minQty: number;
  unit: string;
  supplier: string | null;
  imageUrl: string | null;
  note: string | null;
  status: "active" | "archived";
};

/**
 * Creates a product at zero stock. Quantity is deliberately not settable here:
 * stock only ever moves through a signed stock_movement, so opening stock is
 * recorded as an `in` movement from the Ombor screen.
 */
export async function createProduct(
  input: ProductInput,
  actor: Actor,
): Promise<string> {
  const ref = doc(productsRef());

  // Read before the transaction, not inside it: the client SDK cannot run a
  // query in a transaction, only fetch documents by reference. A product
  // created at the same moment as another could land on a duplicate position,
  // which the catalogue order tolerates - it falls back to name - and the next
  // move in Sozlamalar renumbers away.
  const existing = await getDocs(productsRef());
  const position =
    existing.docs.reduce((max, d) => Math.max(max, d.data().position ?? 0), 0) + 1;

  await runTransaction(db(), async (tx) => {
    const code = await allocateCode(tx, "products");
    tx.set(ref, {
      ...input,
      code,
      position,
      qty: 0,
      createdBy: actor?.id ?? null,
      createdAt: now(),
      updatedAt: now(),
    } as never);
  });

  writeAudit({
    actor,
    action: "create",
    entity: "product",
    entityId: ref.id,
    after: { name: input.name, sellPrice: input.sellPrice },
  });

  return ref.id;
}

export async function updateProduct(
  id: string,
  input: ProductInput,
  before: Product,
  actor: Actor,
): Promise<void> {
  await updateDoc(doc(productsRef(), id), { ...input, updatedAt: now() });

  writeAudit({
    actor,
    action: "update",
    entity: "product",
    entityId: id,
    before: { name: before.name, sellPrice: before.sellPrice },
    after: { name: input.name, sellPrice: input.sellPrice },
  });
}

/**
 * Deletes the product.
 *
 * Sheet rows snapshot the product name and price when something is sold, so a
 * past day's takings survive the product being removed from the catalogue.
 */
/**
 * Writes the catalogue order set in Sozlamalar.
 *
 * Renumbered from 1 on every save, so the positions never accumulate gaps or
 * duplicates however many times the list is shuffled. Only the products that
 * actually moved are written: nudging one item near the top of a long list
 * costs two writes, not the whole catalogue.
 */
export async function setProductOrder(
  ordered: readonly Product[],
): Promise<void> {
  const moved = ordered
    .map((product, i) => ({ product, position: i + 1 }))
    .filter((x) => x.product.position !== x.position);

  if (moved.length === 0) return;

  const batch = writeBatch(db());
  for (const { product, position } of moved) {
    batch.update(doc(productsRef(), product.id), { position, updatedAt: now() });
  }
  await batch.commit();
}

export async function deleteProduct(
  id: string,
  before: Product,
  actor: Actor,
): Promise<void> {
  await deleteDoc(doc(productsRef(), id));
  writeAudit({
    actor,
    action: "delete",
    entity: "product",
    entityId: id,
    before: { name: before.name, sellPrice: before.sellPrice },
  });
}
