import { describe, expect, it } from "vitest";

import { collectWalkIns, visitFromRow, walkInKey } from "./walk-ins";
import type { DailySheetRow, SheetItem } from "@/lib/db/types";
import type { SheetHistoryDay } from "@/lib/db/queries";

function item(name: string, unitPrice: number, qty = 1, paid = false): SheetItem {
  return {
    lineId: `${name}-${qty}-${paid}`,
    productId: name,
    productName: name,
    unitPrice,
    qty,
    lineTotal: unitPrice * qty,
    paid,
  };
}

function row(partial: Partial<DailySheetRow> = {}): DailySheetRow {
  return {
    id: "r",
    position: 1,
    clientId: null,
    clientName: "Sardor Umarov",
    keyNumber: null,
    gymFeeMode: "cash",
    gymFee: 30_000,
    gymFeePaid: false,
    items: [],
    discount: 0,
    note: null,
    createdBy: null,
    createdAt: null as never,
    updatedAt: null as never,
    ...partial,
  };
}

describe("walkInKey", () => {
  it("ignores case", () => {
    expect(walkInKey("Sardor Umarov")).toBe(walkInKey("sardor umarov"));
  });

  it("ignores stray spacing", () => {
    expect(walkInKey("  Sardor   Umarov ")).toBe(walkInKey("Sardor Umarov"));
  });

  it("keeps different people apart", () => {
    expect(walkInKey("Sardor Umarov")).not.toBe(walkInKey("Sardor Umarova"));
  });
});

describe("collectWalkIns", () => {
  it("treats the same name on different days as one person", () => {
    const history: SheetHistoryDay[] = [
      { date: "2026-08-03", rows: [row({ id: "a", clientName: "Sardor Umarov" })] },
      { date: "2026-08-01", rows: [row({ id: "b", clientName: "sardor  umarov" })] },
    ];

    const walkIns = collectWalkIns(history);

    expect(walkIns).toHaveLength(1);
    expect(walkIns[0].visits).toHaveLength(2);
    expect(walkIns[0].firstVisit).toBe("2026-08-01");
    expect(walkIns[0].lastVisit).toBe("2026-08-03");
  });

  it("keeps the most recent spelling of the name", () => {
    const history: SheetHistoryDay[] = [
      { date: "2026-08-03", rows: [row({ clientName: "Sardor Umarov" })] },
      { date: "2026-08-01", rows: [row({ clientName: "sardor umarov" })] },
    ];

    expect(collectWalkIns(history)[0].name).toBe("Sardor Umarov");
  });

  it("ignores members, who have a record of their own", () => {
    const history: SheetHistoryDay[] = [
      {
        date: "2026-08-03",
        rows: [
          row({ id: "a", clientId: "client-1", clientName: "Dilshod Ergashev" }),
          row({ id: "b", clientName: "Sardor Umarov" }),
        ],
      },
    ];

    const walkIns = collectWalkIns(history);
    expect(walkIns.map((w) => w.name)).toEqual(["Sardor Umarov"]);
  });

  it("sums what was spent and what is still owed across visits", () => {
    const history: SheetHistoryDay[] = [
      {
        date: "2026-08-03",
        // 30 000 floor + 12 000 of product, none of it collected.
        rows: [row({ id: "a", items: [item("Suv", 6_000, 2)] })],
      },
      {
        date: "2026-08-01",
        // 30 000 floor paid, 25 000 of product paid.
        rows: [
          row({
            id: "b",
            gymFeePaid: true,
            items: [item("BTS", 25_000, 1, true)],
          }),
        ],
      },
    ];

    const [walkIn] = collectWalkIns(history);
    expect(walkIn.spent).toBe(42_000 + 55_000);
    expect(walkIn.owed).toBe(42_000);
  });

  it("drops a discount off the visit total", () => {
    const history: SheetHistoryDay[] = [
      {
        date: "2026-08-03",
        rows: [row({ items: [item("Suv", 6_000)], discount: 6_000 })],
      },
    ];

    expect(collectWalkIns(history)[0].spent).toBe(30_000);
  });

  it("skips blank names rather than grouping them together", () => {
    const history: SheetHistoryDay[] = [
      {
        date: "2026-08-03",
        rows: [row({ id: "a", clientName: "  " }), row({ id: "b", clientName: "" })],
      },
    ];

    expect(collectWalkIns(history)).toHaveLength(0);
  });

  it("orders by the most recent visit", () => {
    const history: SheetHistoryDay[] = [
      { date: "2026-08-03", rows: [row({ clientName: "Bekzod Tursunov" })] },
      { date: "2026-08-02", rows: [row({ clientName: "Sardor Umarov" })] },
    ];

    expect(collectWalkIns(history).map((w) => w.name)).toEqual([
      "Bekzod Tursunov",
      "Sardor Umarov",
    ]);
  });
});

describe("custom columns in a visit", () => {
  const columns = [
    { id: "col-shkaf", name: "Shkaf", position: 1 },
    { id: "col-massaj", name: "Massaj", position: 2 },
  ];

  it("names the charge from the column definition", () => {
    const visit = visitFromRow(
      "2026-08-04",
      row({ extras: { "col-shkaf": { amount: 5_000 } } }),
      columns,
    );
    expect(visit.extras).toEqual([
      { name: "Shkaf", total: 5_000, paid: false },
    ]);
  });

  it("carries the paid mark through", () => {
    const visit = visitFromRow(
      "2026-08-04",
      row({ extras: { "col-massaj": { amount: 40_000, paid: true } } }),
      columns,
    );
    expect(visit.extras[0]).toEqual({ name: "Massaj", total: 40_000, paid: true });
  });

  it("falls back to «Boshqa» when the column has since been deleted", () => {
    // Dropping it would leave the chips short of the row total.
    const visit = visitFromRow(
      "2026-08-04",
      row({ extras: { "col-gone": { amount: 7_000 } } }),
      columns,
    );
    expect(visit.extras).toEqual([{ name: "Boshqa", total: 7_000, paid: false }]);
    expect(visit.total).toBe(37_000);
  });

  it("skips zero amounts rather than showing an empty chip", () => {
    const visit = visitFromRow(
      "2026-08-04",
      row({ extras: { "col-shkaf": { amount: 0 } } }),
      columns,
    );
    expect(visit.extras).toEqual([]);
  });

  it("leaves a row with no custom charges with an empty list", () => {
    expect(visitFromRow("2026-08-04", row(), columns).extras).toEqual([]);
  });
});
