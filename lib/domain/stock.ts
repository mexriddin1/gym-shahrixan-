import type { MovementType } from "@/lib/db/types";

/**
 * Sign of each movement type. Stock is only ever changed by appending a signed
 * movement, never by assigning to product.qty, so the movement log always
 * reconstructs the current quantity exactly.
 */
const SIGN: Record<MovementType, 1 | -1 | 0> = {
  in: 1,
  return: 1,
  sale: -1,
  damage: -1,
  lost: -1,
  staff: -1,
  free: -1,
  adjust: 0, // signed by the caller: a correction can go either way
};

/** Movement types whose quantity the caller supplies with its own sign. */
export function isSignedByCaller(type: MovementType): boolean {
  return SIGN[type] === 0;
}

/**
 * Signed delta for a movement. `qty` is supplied unsigned for everything
 * except `adjust`, where the sign carries the direction of the correction.
 */
export function movementDelta(type: MovementType, qty: number): number {
  if (isSignedByCaller(type)) return Math.trunc(qty);
  return Math.abs(Math.trunc(qty)) * SIGN[type];
}

export type StockChange = {
  delta: number;
  qtyBefore: number;
  qtyAfter: number;
};

/**
 * Applies a movement to a current quantity.
 *
 * Stock is allowed to go negative rather than being clamped: a till that has
 * physically sold something it did not know it had is a real state, and hiding
 * it behind a clamp to zero loses the discrepancy the owner needs to see.
 */
export function applyMovement(
  currentQty: number,
  type: MovementType,
  qty: number,
): StockChange {
  const delta = movementDelta(type, qty);
  return { delta, qtyBefore: currentQty, qtyAfter: currentQty + delta };
}

/** Rebuilds a quantity from its movement history, for reconciliation. */
export function replayMovements(movements: { qty: number }[]): number {
  return movements.reduce((sum, m) => sum + m.qty, 0);
}

export function isLowStock(product: { qty: number; minQty: number }): boolean {
  return product.minQty > 0 && product.qty <= product.minQty;
}
