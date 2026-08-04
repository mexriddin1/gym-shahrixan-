import { describe, expect, it } from "vitest";

import {
  clampPayment,
  computeDebt,
  computeFinalPrice,
  orderTotals,
} from "./pricing";

describe("computeFinalPrice", () => {
  const price = 300_000;

  it("returns the original price when there is no discount", () => {
    expect(computeFinalPrice(price, "none", 0)).toBe(300_000);
    // A value is ignored entirely when the type says there is no discount.
    expect(computeFinalPrice(price, "none", 50_000)).toBe(300_000);
  });

  it("subtracts an absolute amount", () => {
    expect(computeFinalPrice(price, "amount", 50_000)).toBe(250_000);
  });

  it("never goes below zero on an oversized amount discount", () => {
    expect(computeFinalPrice(price, "amount", 400_000)).toBe(0);
  });

  it("applies a percentage and rounds the resulting price", () => {
    expect(computeFinalPrice(price, "percent", 10)).toBe(270_000);
    // Rounds the discounted total, not the discount itself.
    expect(computeFinalPrice(100_000, "percent", 33)).toBe(67_000);
    expect(computeFinalPrice(99_999, "percent", 33)).toBe(66_999);
  });

  it("clamps a percentage above 100 to zero", () => {
    expect(computeFinalPrice(price, "percent", 150)).toBe(0);
  });

  it("treats fixed as the final price, not a reduction", () => {
    expect(computeFinalPrice(price, "fixed", 180_000)).toBe(180_000);
    // Above the original price is allowed: a fixed price is authoritative.
    expect(computeFinalPrice(price, "fixed", 350_000)).toBe(350_000);
    expect(computeFinalPrice(price, "fixed", -10)).toBe(0);
  });

  it("makes free actually free", () => {
    expect(computeFinalPrice(price, "free", 0)).toBe(0);
    expect(computeFinalPrice(price, "free", 999)).toBe(0);
  });
});

describe("computeDebt", () => {
  it("is the unpaid remainder", () => {
    expect(computeDebt(300_000, 100_000)).toBe(200_000);
  });

  it("is zero once fully paid", () => {
    expect(computeDebt(300_000, 300_000)).toBe(0);
  });

  it("never reports a negative debt on overpayment", () => {
    expect(computeDebt(300_000, 350_000)).toBe(0);
  });
});

describe("clampPayment", () => {
  it("caps a payment at what is owed", () => {
    expect(clampPayment(400_000, 300_000)).toBe(300_000);
  });

  it("passes through a partial payment", () => {
    expect(clampPayment(120_000, 300_000)).toBe(120_000);
  });

  it("rejects a negative payment", () => {
    expect(clampPayment(-50_000, 300_000)).toBe(0);
  });
});

describe("orderTotals", () => {
  const items = [
    { unitPrice: 5_000, qty: 2 },
    { unitPrice: 30_000, qty: 1 },
  ];

  it("sums the lines", () => {
    expect(orderTotals(items)).toEqual({
      total: 40_000,
      discount: 0,
      finalPrice: 40_000,
    });
  });

  it("applies a discount", () => {
    expect(orderTotals(items, 5_000)).toEqual({
      total: 40_000,
      discount: 5_000,
      finalPrice: 35_000,
    });
  });

  it("caps a discount at the order total so the final price cannot go negative", () => {
    expect(orderTotals(items, 90_000)).toEqual({
      total: 40_000,
      discount: 40_000,
      finalPrice: 0,
    });
  });

  it("handles an empty order", () => {
    expect(orderTotals([])).toEqual({ total: 0, discount: 0, finalPrice: 0 });
  });
});
