import { doc, runTransaction } from "firebase/firestore";

import { db, paymentsRef, subscriptionsRef } from "./collections";
import { commitCounters, now, readCounters, writeAudit, type Actor } from "./write";
import type {
  Client,
  DateKey,
  DiscountType,
  Payment,
  PaymentMethod,
  Subscription,
  Tariff,
} from "./types";
import { clampPayment, computeFinalPrice } from "@/lib/domain/pricing";
import { computeEndDate } from "@/lib/domain/subscription";

/* ----------------------------- sell a tariff ----------------------------- */

export type SellTariffInput = {
  client: Client;
  tariff: Tariff;
  startDate: DateKey;
  discountType: DiscountType;
  discountValue: number;
  discountReason: string | null;
  /** Manual end date overrides the duration. Requires a reason. */
  endDate: DateKey | null;
  endDateReason: string | null;
  paidAmount: number;
  method: PaymentMethod;
  note: string | null;
};

/**
 * Sells a tariff to a client, snapshotting the terms onto the subscription so
 * later edits to the tariff template never rewrite this sale.
 *
 * The subscription and its opening payment commit together: a member who was
 * charged must always end up with the abonement they paid for.
 */
export async function sellTariff(
  input: SellTariffInput,
  actor: Actor,
): Promise<string> {
  const {
    client,
    tariff,
    startDate,
    discountType,
    discountValue,
    endDate,
    paidAmount,
    method,
  } = input;

  if (endDate && !input.endDateReason?.trim()) {
    throw new Error("Sanani qo'lda o'zgartirish sababi majburiy");
  }

  const originalPrice = tariff.price;
  const finalPrice = computeFinalPrice(originalPrice, discountType, discountValue);
  const paid = clampPayment(paidAmount, finalPrice);

  const subRef = doc(subscriptionsRef());
  const payRef = doc(paymentsRef());
  const clientName = `${client.firstName} ${client.lastName ?? ""}`.trim();

  await runTransaction(db(), async (tx) => {
    const codes = await readCounters(tx, ["subscriptions", "payments"]);

    tx.set(subRef, {
      code: codes.subscriptions,
      clientId: client.id,
      clientName,
      tariffId: tariff.id,
      tariffName: tariff.name,
      originalPrice,
      discountType,
      discountValue,
      discountReason: input.discountReason,
      finalPrice,
      durationDays: tariff.durationDays,
      visitLimit: tariff.visitLimit,
      weeklyLimit: tariff.weeklyLimit,
      allowedWeekdays: tariff.allowedWeekdays,
      isVip: tariff.isVip,
      visitsUsed: 0,
      startDate,
      endDate: endDate ?? computeEndDate(startDate, tariff.durationDays),
      endDateManual: !!endDate,
      status: "active",
      note: input.note,
      createdBy: actor?.id ?? null,
      createdAt: now(),
      updatedAt: now(),
    } as never);

    if (paid > 0) {
      tx.set(payRef, {
        code: codes.payments,
        clientId: client.id,
        clientName,
        subscriptionId: subRef.id,
        orderId: null,
        amount: paid,
        method,
        note: "Tarif uchun boshlang'ich to'lov",
        paidAt: now(),
        createdBy: actor?.id ?? null,
      } as never);
    }

    commitCounters(tx, paid > 0 ? codes : { subscriptions: codes.subscriptions });
  });

  writeAudit({
    actor,
    action: "create",
    entity: "subscription",
    entityId: subRef.id,
    after: { client: clientName, tariff: tariff.name, finalPrice, paid },
  });

  return subRef.id;
}

/* ------------------------------- payments ------------------------------- */

export type PaymentInput = {
  clientId: string | null;
  clientName: string | null;
  subscriptionId: string | null;
  orderId: string | null;
  amount: number;
  method: PaymentMethod;
  note: string | null;
};

/** Records money actually received. Amount is capped by the caller. */
export async function recordPayment(
  input: PaymentInput,
  actor: Actor,
): Promise<string> {
  if (input.amount <= 0) throw new Error("To'lov summasi 0 dan katta bo'lishi kerak");

  const ref = doc(paymentsRef());

  await runTransaction(db(), async (tx) => {
    const codes = await readCounters(tx, ["payments"]);
    tx.set(ref, {
      ...input,
      code: codes.payments,
      paidAt: now(),
      createdBy: actor?.id ?? null,
    } as never);
    commitCounters(tx, codes);
  });

  writeAudit({
    actor,
    action: "create",
    entity: "payment",
    entityId: ref.id,
    after: {
      amount: input.amount,
      method: input.method,
      client: input.clientName,
    },
  });

  return ref.id;
}

/**
 * Sum of payments per subscription id, for deriving debt.
 *
 * Product sales are settled on the daily sheet rather than as orders, so a
 * subscription is now the only thing that can carry debt.
 */
export function paidBySubscription(payments: Payment[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    if (!p.subscriptionId) continue;
    map.set(p.subscriptionId, (map.get(p.subscriptionId) ?? 0) + p.amount);
  }
  return map;
}

/**
 * Deletes a payment.
 *
 * Debt is derived from the payments that back it, so removing one puts the
 * money straight back on the debtor list. That is the point: a payment entered
 * against the wrong member has to be retractable.
 */
export async function deletePayment(
  paymentId: string,
  before: Payment,
  actor: Actor,
): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(paymentsRef(), paymentId));
  writeAudit({
    actor,
    action: "delete",
    entity: "payment",
    entityId: paymentId,
    before: {
      amount: before.amount,
      client: before.clientName,
      code: before.code,
    },
  });
}

/* -------------------- cancelling and deleting a tariff ------------------- */

/**
 * Calls a subscription off without erasing that it happened.
 *
 * Cancelling is the reversible half of the pair: the row stays, its dates stay,
 * and any payments against it stay, but `derivedStatus` reports it cancelled
 * and `listDebtors` stops chasing it. Nothing is owed on something called off.
 *
 * This is what you want when a member stops coming mid-term. Deleting is for
 * a subscription that should never have been recorded at all.
 */
export async function cancelSubscription(
  id: string,
  before: Subscription,
  actor: Actor,
  reason: string,
): Promise<void> {
  const { updateDoc } = await import("firebase/firestore");
  await updateDoc(doc(subscriptionsRef(), id), {
    status: "cancelled",
    note: reason.trim() || before.note,
    updatedAt: now(),
  });

  writeAudit({
    actor,
    action: "cancel",
    entity: "subscription",
    entityId: id,
    before: { status: before.status, client: before.clientName },
    after: { status: "cancelled" },
    reason: reason.trim() || null,
  });
}

/**
 * Erases a subscription, and optionally the payments taken against it.
 *
 * The two are separable on purpose. Deleting the subscription alone leaves its
 * payments standing as money the gym genuinely received, which is usually the
 * honest record. Deleting both is for a sale entered by mistake, where the
 * money never changed hands either.
 */
export async function deleteSubscription(
  id: string,
  before: Subscription,
  actor: Actor,
  options: { withPayments: boolean } = { withPayments: false },
): Promise<void> {
  const { deleteDoc, getDocs, query, where, writeBatch } = await import(
    "firebase/firestore"
  );

  if (options.withPayments) {
    const snap = await getDocs(
      query(paymentsRef(), where("subscriptionId", "==", id)),
    );
    const batch = writeBatch(db());
    for (const d of snap.docs) batch.delete(d.ref);
    batch.delete(doc(subscriptionsRef(), id));
    await batch.commit();
  } else {
    await deleteDoc(doc(subscriptionsRef(), id));
  }

  writeAudit({
    actor,
    action: "delete",
    entity: "subscription",
    entityId: id,
    before: {
      client: before.clientName,
      tariff: before.tariffName,
      code: before.code,
      withPayments: options.withPayments,
    },
  });
}
