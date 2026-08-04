import {
  addDoc,
  serverTimestamp,
  type Transaction,
} from "firebase/firestore";

import {
  auditRef,
  counterDoc,
  COUNTER_START,
  type CounterName,
} from "./collections";
import type { AuditAction } from "./types";

/**
 * Allocates the next human-facing `code` for an entity, inside a transaction.
 *
 * Firestore requires every read in a transaction to happen before every write,
 * so call this before any `tx.set`/`tx.update` in the same transaction.
 */
export async function allocateCode(
  tx: Transaction,
  entity: CounterName,
): Promise<number> {
  const ref = counterDoc(entity);
  const snap = await tx.get(ref);
  const next = snap.exists()
    ? (snap.data().value as number) + 1
    : COUNTER_START[entity];
  tx.set(ref, { value: next }, { merge: true });
  return next;
}

/**
 * Two-phase counter allocation, for transactions that touch several entities.
 *
 * Firestore requires every read in a transaction to precede every write, and
 * `allocateCode` reads then writes. Calling it twice would put a write before
 * the second read and abort the transaction. So: read all counters, do any
 * other reads, then commit all counters together.
 */
export async function readCounters<E extends CounterName>(
  tx: Transaction,
  entities: E[],
): Promise<Record<E, number>> {
  const entries = await Promise.all(
    entities.map(async (entity) => {
      const snap = await tx.get(counterDoc(entity));
      const next = snap.exists()
        ? (snap.data().value as number) + 1
        : COUNTER_START[entity];
      return [entity, next] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<E, number>;
}

export function commitCounters(
  tx: Transaction,
  codes: Record<string, number>,
): void {
  for (const [entity, value] of Object.entries(codes)) {
    tx.set(counterDoc(entity as CounterName), { value }, { merge: true });
  }
}

export type Actor = { id: string; email: string } | null;

/**
 * Appends an audit entry. Every financial mutation writes one.
 *
 * Deliberately fire-and-forget outside the transaction: an audit write failing
 * must never roll back the money movement it describes. A dropped audit line
 * is recoverable, a half-applied payment is not.
 */
export function writeAudit(entry: {
  actor: Actor;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}): void {
  void addDoc(auditRef(), {
    actorId: entry.actor?.id ?? null,
    actorEmail: entry.actor?.email ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    createdAt: serverTimestamp(),
    // addDoc supplies the id; the converter strips it on the way out.
  } as never).catch((error) => {
    console.error("audit write failed", error);
  });
}

export const now = serverTimestamp;
