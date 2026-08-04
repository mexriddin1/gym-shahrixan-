import type { DiscountType } from "@/lib/db/types";

/**
 * Final price after a discount.
 *
 * Ported verbatim from computeFinal() in gym/server/src/routes/subscriptions.js.
 * The clamping and the rounding point both matter: `percent` rounds the whole
 * discounted price rather than the discount, so 33% off 100 000 is 67 000 and
 * not 67 000 minus a rounding drift.
 */
export function computeFinalPrice(
  price: number,
  type: DiscountType,
  value: number,
): number {
  const v = Number(value) || 0;
  switch (type) {
    case "amount":
      return Math.max(0, price - v);
    case "percent":
      return Math.max(0, Math.round(price * (1 - v / 100)));
    case "fixed":
      return Math.max(0, v);
    case "free":
      return 0;
    default:
      return price;
  }
}

/**
 * Money still owed. Never negative: overpayment is change handed back at the
 * desk, not a negative debt carried on the books.
 */
export function computeDebt(finalPrice: number, paid: number): number {
  return Math.max(0, finalPrice - paid);
}

/** A payment can never exceed what is owed on the thing being paid for. */
export function clampPayment(amount: number, finalPrice: number): number {
  return Math.min(Math.max(0, amount), finalPrice);
}

/** Order line total. */
export function lineTotal(unitPrice: number, qty: number): number {
  return unitPrice * qty;
}

/** Order totals from its lines plus an absolute discount. */
export function orderTotals(
  items: { unitPrice: number; qty: number }[],
  discount = 0,
): { total: number; discount: number; finalPrice: number } {
  const total = items.reduce((sum, i) => sum + lineTotal(i.unitPrice, i.qty), 0);
  const clamped = Math.min(Math.max(0, discount), total);
  return { total, discount: clamped, finalPrice: total - clamped };
}
