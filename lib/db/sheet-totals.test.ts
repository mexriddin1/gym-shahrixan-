import { describe, expect, it } from "vitest";

import { rowCollected, rowTotal, type SheetItem } from "./types";
import { nextPosition } from "./sheet-mutations";
import { SEED_SHEET_ROWS, seedRowItems, type SeedSheetRow } from "./seed-data";

/** Shapes a seeded transcription into what `rowTotal` consumes. */
function toRow(seed: SeedSheetRow) {
  const items: SheetItem[] = seedRowItems(seed).map((i) => ({
    lineId: i.productName,
    productId: i.productName,
    productName: i.productName,
    unitPrice: i.unitPrice,
    qty: i.qty,
    lineTotal: i.lineTotal,
  }));
  return {
    gymFeeMode: seed.gymFeeMode,
    gymFee: seed.gymFee,
    items,
    discount: 0,
  };
}

/**
 * Reconciliation against the gym's own workbook.
 *
 * The photographed JAMI column is skewed by the camera angle and does not line
 * up reliably with its rows, so only the three rows whose totals are legible
 * beyond doubt are asserted against the book. The rest of the suite checks the
 * arithmetic itself rather than a possibly-misread number.
 */
describe("daily sheet totals against the workbook", () => {
  const byName = (name: string) => {
    const seed = SEED_SHEET_ROWS.find((r) => r.clientName === name);
    if (!seed) throw new Error(`seed row missing: ${name}`);
    return toRow(seed);
  };

  it("matches the book for a cash day pass with two products", () => {
    // Book row 1: Izzatullo, zal 30 000, suv 5 000, BTS 30 000 -> 65 000
    expect(rowTotal(byName("Izzatullo"))).toBe(65_000);
  });

  it("matches the book for a second cash day pass", () => {
    // Book row 2: Otabek, zal 30 000, suv 25 000, BTS 10 000 -> 65 000
    expect(rowTotal(byName("Otabek"))).toBe(65_000);
  });

  it("matches the book for a monthly member who bought nothing", () => {
    // Book row 3: Noxitbek, "oylik", no products -> 0
    expect(rowTotal(byName("Noxitbek"))).toBe(0);
  });
});

describe("seedRowItems", () => {
  it("infers a quantity when the total divides by the shelf price", () => {
    // Otabek's 25 000 of water at 5 000 each is five bottles.
    const [suv] = seedRowItems({
      clientKey: null,
      clientName: "x",
      gymFeeMode: "cash",
      gymFee: 0,
      charges: { Suv: 25_000 },
    });
    expect(suv).toEqual({
      productName: "Suv",
      unitPrice: 5_000,
      qty: 5,
      lineTotal: 25_000,
    });
  });

  it("falls back to a single line when the total does not divide evenly", () => {
    const [odd] = seedRowItems({
      clientKey: null,
      clientName: "x",
      gymFeeMode: "cash",
      gymFee: 0,
      charges: { Suv: 7_500 },
    });
    expect(odd).toEqual({
      productName: "Suv",
      unitPrice: 7_500,
      qty: 1,
      lineTotal: 7_500,
    });
  });
});

const item = (lineTotal: number, qty = 1): SheetItem => ({
  lineId: `l${lineTotal}-${qty}`,
  productId: `p${lineTotal}`,
  productName: "Mahsulot",
  unitPrice: lineTotal / qty,
  qty,
  lineTotal,
});

describe("rowTotal", () => {
  it("excludes the gym fee when the day is covered by a subscription", () => {
    // "oylik" in the ZAL column means no cash was taken for the floor, but
    // products bought that day are still owed.
    expect(
      rowTotal({
        gymFeeMode: "subscription",
        gymFee: 30_000,
        items: [item(5_000)],
        discount: 0,
      }),
    ).toBe(5_000);
  });

  it("includes the gym fee when paid in cash", () => {
    expect(
      rowTotal({
        gymFeeMode: "cash",
        gymFee: 30_000,
        items: [item(5_000)],
        discount: 0,
      }),
    ).toBe(35_000);
  });

  it("is zero for an untouched row", () => {
    expect(
      rowTotal({ gymFeeMode: "none", gymFee: 0, items: [], discount: 0 }),
    ).toBe(0);
  });

  it("sums several product lines by their line total", () => {
    expect(
      rowTotal({
        gymFeeMode: "cash",
        gymFee: 30_000,
        items: [item(10_000, 2), item(30_000, 3), item(200_000)],
        discount: 0,
      }),
    ).toBe(270_000);
  });

  it("subtracts a discount from the row total", () => {
    expect(
      rowTotal({
        gymFeeMode: "cash",
        gymFee: 30_000,
        items: [item(10_000)],
        discount: 5_000,
      }),
    ).toBe(35_000);
  });

  it("clamps to zero when the discount exceeds the total", () => {
    // An over-discount is a mistake at the till, not money the gym owes.
    expect(
      rowTotal({
        gymFeeMode: "cash",
        gymFee: 30_000,
        items: [],
        discount: 50_000,
      }),
    ).toBe(0);
  });

  it("ignores a gym fee left behind after switching to subscription", () => {
    // Guards the UI path where a cashier types a fee then marks it "oylik".
    expect(
      rowTotal({
        gymFeeMode: "subscription",
        gymFee: 50_000,
        items: [],
        discount: 0,
      }),
    ).toBe(0);
  });
});

describe("rowCollected", () => {
  it("counts nothing until something is marked paid", () => {
    // The gym charges on the way out, so an amount on the sheet is a charge,
    // not a receipt.
    expect(
      rowCollected({
        gymFeeMode: "cash",
        gymFee: 30_000,
        items: [item(10_000)],
      }),
    ).toBe(0);
  });

  it("counts the floor fee once marked", () => {
    expect(
      rowCollected({
        gymFeeMode: "cash",
        gymFee: 30_000,
        gymFeePaid: true,
        items: [item(10_000)],
      }),
    ).toBe(30_000);
  });

  it("counts product lines independently of the floor fee", () => {
    expect(
      rowCollected({
        gymFeeMode: "cash",
        gymFee: 30_000,
        items: [{ ...item(10_000), paid: true }, item(5_000)],
      }),
    ).toBe(10_000);
  });

  it("never counts a floor fee covered by a subscription", () => {
    // There is no cash to collect on an "oylik" row, so marking it must not
    // invent takings.
    expect(
      rowCollected({
        gymFeeMode: "subscription",
        gymFee: 30_000,
        gymFeePaid: true,
        items: [],
      }),
    ).toBe(0);
  });

  it("keeps a repeat purchase separate from the settled one", () => {
    // A member pays for two waters, then buys a third. The first line stays
    // collected; the new one is still owed. Merging them would have counted
    // the third bottle as already paid for.
    const settled = { ...item(10_000, 2), paid: true };
    const fresh = { ...item(5_000), lineId: "second-visit" };
    const row = {
      gymFeeMode: "cash" as const,
      gymFee: 0,
      items: [settled, fresh],
      discount: 0,
    };
    expect(rowCollected(row)).toBe(10_000);
    expect(rowTotal(row)).toBe(15_000);
  });

  it("adds up to the row total when everything is settled", () => {
    const row = {
      gymFeeMode: "cash" as const,
      gymFee: 30_000,
      gymFeePaid: true,
      items: [{ ...item(10_000), paid: true }, { ...item(5_000), paid: true }],
      discount: 0,
    };
    expect(rowCollected(row)).toBe(rowTotal(row));
  });
});

describe("seed integrity", () => {
  it("has the full day from the photographed sheet", () => {
    expect(SEED_SHEET_ROWS).toHaveLength(28);
  });

  it("never carries a gym fee on a subscription row", () => {
    // Otherwise a "oylik" row would silently hold money it does not charge.
    for (const row of SEED_SHEET_ROWS) {
      if (row.gymFeeMode === "subscription") expect(row.gymFee).toBe(0);
    }
  });

  it("has no zero-valued product charges", () => {
    // A zero charge and an absent one must stay distinguishable.
    for (const row of SEED_SHEET_ROWS) {
      for (const amount of Object.values(row.charges)) {
        expect(amount).toBeGreaterThan(0);
      }
    }
  });

  it("reconstructs every seeded row without losing money", () => {
    for (const row of SEED_SHEET_ROWS) {
      const charged = Object.values(row.charges).reduce((s, v) => s + v, 0);
      const items = seedRowItems(row).reduce((s, i) => s + i.lineTotal, 0);
      expect(items).toBe(charged);
    }
  });
});

describe("nextPosition", () => {
  it("starts at 1 on an empty sheet", () => {
    expect(nextPosition([])).toBe(1);
  });

  it("continues from the last row", () => {
    expect(nextPosition([{ position: 1 }, { position: 2 }])).toBe(3);
  });

  it("skips past a gap left by a deleted row", () => {
    // The bug this replaced: three rows numbered 1, 2 and 4 counted to 3, and
    // handed out a position that row 4's neighbour was about to reuse.
    expect(nextPosition([{ position: 1 }, { position: 2 }, { position: 4 }])).toBe(5);
  });

  it("never reuses a number after the middle of the sheet is deleted", () => {
    // The real sheet that surfaced this: positions 1,2,3,5,6,7 with 6 rows.
    const rows = [1, 2, 3, 5, 6, 7].map((position) => ({ position }));
    expect(nextPosition(rows)).toBe(8);
    expect(rows.map((r) => r.position)).not.toContain(nextPosition(rows));
  });

  it("is not confused by rows arriving out of order", () => {
    expect(nextPosition([{ position: 7 }, { position: 2 }])).toBe(8);
  });
});

describe("custom columns", () => {
  const base = {
    gymFeeMode: "cash" as const,
    gymFee: 30_000,
    items: [] as SheetItem[],
    discount: 0,
  };

  it("adds a recorded amount to the row total", () => {
    expect(rowTotal({ ...base, extras: { shkaf: { amount: 5_000 } } })).toBe(
      35_000,
    );
  });

  it("sums several columns", () => {
    const extras = {
      shkaf: { amount: 5_000 },
      massaj: { amount: 40_000 },
    };
    expect(rowTotal({ ...base, extras })).toBe(75_000);
  });

  it("subtracts the discount after the custom columns", () => {
    const row = { ...base, discount: 10_000, extras: { shkaf: { amount: 5_000 } } };
    expect(rowTotal(row)).toBe(25_000);
  });

  it("keeps counting an amount whose column was deleted", () => {
    // The column definition lives in settings; the money lives on the row.
    // Deleting the definition must not quietly reduce a past day's takings.
    expect(rowTotal({ ...base, extras: { "gone-column": { amount: 7_000 } } })).toBe(
      37_000,
    );
  });

  it("treats a row with no extras exactly as before", () => {
    expect(rowTotal(base)).toBe(rowTotal({ ...base, extras: {} }));
    expect(rowTotal({ ...base, extras: undefined })).toBe(30_000);
  });

  it("collects only the amounts marked paid", () => {
    const row = {
      ...base,
      gymFeePaid: true,
      extras: {
        shkaf: { amount: 5_000, paid: true },
        massaj: { amount: 40_000 },
      },
    };
    expect(rowTotal(row)).toBe(75_000);
    expect(rowCollected(row)).toBe(35_000);
  });

  it("leaves nothing collected when the paid marks are absent", () => {
    const row = { ...base, extras: { shkaf: { amount: 5_000 } } };
    expect(rowCollected(row)).toBe(0);
  });
});
