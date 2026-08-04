import { describe, expect, it } from "vitest";

import {
  applyMovement,
  isLowStock,
  isSignedByCaller,
  movementDelta,
  replayMovements,
} from "./stock";

describe("movementDelta", () => {
  it("adds for incoming stock and returns", () => {
    expect(movementDelta("in", 24)).toBe(24);
    expect(movementDelta("return", 2)).toBe(2);
  });

  it("subtracts for every outgoing type", () => {
    expect(movementDelta("sale", 3)).toBe(-3);
    expect(movementDelta("damage", 1)).toBe(-1);
    expect(movementDelta("lost", 2)).toBe(-2);
    expect(movementDelta("staff", 1)).toBe(-1);
    expect(movementDelta("free", 4)).toBe(-4);
  });

  it("ignores a sign the caller passed on a fixed-direction type", () => {
    // A sale of -3 is still a sale of 3 leaving the shelf.
    expect(movementDelta("sale", -3)).toBe(-3);
    expect(movementDelta("in", -24)).toBe(24);
  });

  it("keeps the caller's sign for a correction", () => {
    expect(isSignedByCaller("adjust")).toBe(true);
    expect(movementDelta("adjust", 5)).toBe(5);
    expect(movementDelta("adjust", -5)).toBe(-5);
  });
});

describe("applyMovement", () => {
  it("records before and after around a sale", () => {
    expect(applyMovement(20, "sale", 3)).toEqual({
      delta: -3,
      qtyBefore: 20,
      qtyAfter: 17,
    });
  });

  it("records before and after around a delivery", () => {
    expect(applyMovement(17, "in", 24)).toEqual({
      delta: 24,
      qtyBefore: 17,
      qtyAfter: 41,
    });
  });

  it("lets stock go negative rather than hiding a discrepancy", () => {
    expect(applyMovement(2, "sale", 5)).toEqual({
      delta: -5,
      qtyBefore: 2,
      qtyAfter: -3,
    });
  });
});

describe("replayMovements", () => {
  it("reconstructs the current quantity from history", () => {
    const history = [
      { qty: 24 }, // delivery
      { qty: -3 }, // sale
      { qty: -1 }, // damage
      { qty: 1 }, // return
    ];
    expect(replayMovements(history)).toBe(21);
  });

  it("is zero for a product that never moved", () => {
    expect(replayMovements([])).toBe(0);
  });
});

describe("isLowStock", () => {
  it("flags at or below the threshold", () => {
    expect(isLowStock({ qty: 3, minQty: 5 })).toBe(true);
    expect(isLowStock({ qty: 5, minQty: 5 })).toBe(true);
  });

  it("does not flag above the threshold", () => {
    expect(isLowStock({ qty: 6, minQty: 5 })).toBe(false);
  });

  it("never flags when no threshold is set", () => {
    expect(isLowStock({ qty: 0, minQty: 0 })).toBe(false);
  });
});
