import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAYMENT_METHODS,
  paymentMethodId,
  paymentMethodLabel,
  rowCollected,
  rowCollectedByMethod,
  totalsByMethod,
  type DailySheetRow,
  type SheetItem,
} from "./types";

const METHODS = DEFAULT_PAYMENT_METHODS;

/** A sheet row with only the fields the money functions read. */
function row(
  over: Partial<
    Pick<
      DailySheetRow,
      | "gymFeeMode"
      | "gymFee"
      | "gymFeePaid"
      | "gymFeeMethod"
      | "items"
      | "extras"
      | "discount"
    >
  > = {},
) {
  return {
    gymFeeMode: "cash" as const,
    gymFee: 0,
    items: [] as SheetItem[],
    extras: {},
    discount: 0,
    ...over,
  };
}

function item(over: Partial<SheetItem> & { lineTotal: number }): SheetItem {
  return {
    lineId: over.lineId ?? "l1",
    productId: "p1",
    productName: "Suv",
    unitPrice: over.lineTotal,
    qty: 1,
    ...over,
  };
}

describe("paymentMethodLabel", () => {
  it("names a configured method", () => {
    expect(paymentMethodLabel("click", METHODS)).toBe("Click");
  });

  it("falls back to the old fixed list for a method the gym has dropped", () => {
    // A payment recorded as Payme before the list became editable still has to
    // read as Payme, not as a raw id.
    expect(paymentMethodLabel("payme", METHODS)).toBe("Payme");
  });

  it("says so plainly when nothing was recorded", () => {
    expect(paymentMethodLabel(null, METHODS)).toBe("Belgilanmagan");
    expect(paymentMethodLabel(undefined, METHODS)).toBe("Belgilanmagan");
  });

  it("prefers the gym's own name over the built-in one", () => {
    expect(
      paymentMethodLabel("cash", [{ id: "cash", name: "Naqd pul", position: 1 }]),
    ).toBe("Naqd pul");
  });
});

describe("paymentMethodId", () => {
  it("slugs the name, so re-adding a built-in lands on its old id", () => {
    expect(paymentMethodId("Payme", [])).toBe("payme");
    expect(paymentMethodId("  Naqd  ", [])).toBe("naqd");
  });

  it("suffixes rather than colliding with an id already in use", () => {
    expect(paymentMethodId("Click", ["click"])).toBe("click-2");
    expect(paymentMethodId("Click", ["click", "click-2"])).toBe("click-3");
  });

  it("still produces an id for a name with nothing sluggable in it", () => {
    expect(paymentMethodId("НАЛ", [])).toBe("usul");
  });
});

describe("rowCollectedByMethod", () => {
  it("attributes each settled charge to how it came in", () => {
    const r = row({
      gymFee: 30_000,
      gymFeePaid: true,
      gymFeeMethod: "cash",
      items: [item({ lineId: "a", lineTotal: 5_000, paid: true, method: "click" })],
    });

    expect(rowCollectedByMethod(r)).toEqual([
      { method: "cash", amount: 30_000 },
      { method: "click", amount: 5_000 },
    ]);
  });

  it("leaves a charge settled before methods existed unattributed", () => {
    // Guessing cash here would put money in a till that never saw it.
    const r = row({ gymFee: 30_000, gymFeePaid: true });
    expect(rowCollectedByMethod(r)).toEqual([{ method: null, amount: 30_000 }]);
  });

  it("ignores charges nobody has paid yet", () => {
    const r = row({
      gymFee: 30_000,
      items: [item({ lineId: "a", lineTotal: 5_000 })],
      extras: { shkaf: { amount: 2_000 } },
    });
    expect(rowCollectedByMethod(r)).toEqual([]);
  });

  it("counts a subscription member's extras without their covered floor fee", () => {
    const r = row({
      gymFeeMode: "subscription",
      gymFee: 0,
      gymFeePaid: true,
      extras: { shkaf: { amount: 2_000, paid: true, method: "click" } },
    });
    expect(rowCollectedByMethod(r)).toEqual([{ method: "click", amount: 2_000 }]);
  });

  it("always sums to what the row has collected", () => {
    const r = row({
      gymFee: 30_000,
      gymFeePaid: true,
      gymFeeMethod: "cash",
      items: [
        item({ lineId: "a", lineTotal: 5_000, paid: true, method: "click" }),
        item({ lineId: "b", lineTotal: 7_000 }),
      ],
      extras: {
        shkaf: { amount: 2_000, paid: true },
        massaj: { amount: 9_000 },
      },
      discount: 4_000,
    });

    const split = rowCollectedByMethod(r).reduce((s, c) => s + c.amount, 0);
    expect(split).toBe(rowCollected(r));
    expect(split).toBe(37_000);
  });
});

describe("totalsByMethod", () => {
  it("rolls the day up per method, unattributed money kept apart", () => {
    const totals = totalsByMethod([
      row({ gymFee: 30_000, gymFeePaid: true, gymFeeMethod: "cash" }),
      row({ gymFee: 30_000, gymFeePaid: true, gymFeeMethod: "click" }),
      row({
        gymFee: 20_000,
        gymFeePaid: true,
        gymFeeMethod: "cash",
        items: [item({ lineId: "a", lineTotal: 5_000, paid: true })],
      }),
    ]);

    expect(totals.get("cash")).toBe(50_000);
    expect(totals.get("click")).toBe(30_000);
    expect(totals.get(null)).toBe(5_000);
  });
});
