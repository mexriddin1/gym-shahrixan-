import { describe, expect, it } from "vitest";

import { byCatalogueOrder, reorder } from "./catalogue";

const p = (name: string, position?: number) =>
  ({ name, position }) as { name: string; position: number };

describe("byCatalogueOrder", () => {
  it("follows the position staff set, not the alphabet", () => {
    const sorted = [p("Coca-Cola", 3), p("Protein", 1), p("Ovqat", 2)]
      .sort(byCatalogueOrder)
      .map((x) => x.name);

    expect(sorted).toEqual(["Protein", "Ovqat", "Coca-Cola"]);
  });

  // Products created before the order existed carry no position. They belong
  // at the end, not scattered through an order somebody chose deliberately.
  it("puts unplaced products last, in name order", () => {
    const sorted = [p("Sut"), p("Fanta"), p("Protein", 1)]
      .sort(byCatalogueOrder)
      .map((x) => x.name);

    expect(sorted).toEqual(["Protein", "Fanta", "Sut"]);
  });

  it("breaks a tie on position by name", () => {
    const sorted = [p("Pepsi", 1), p("Fanta", 1)]
      .sort(byCatalogueOrder)
      .map((x) => x.name);

    expect(sorted).toEqual(["Fanta", "Pepsi"]);
  });
});

describe("reorder", () => {
  const list = ["a", "b", "c", "d"];

  it("moves an item down, pushing the ones it passes up", () => {
    expect(reorder(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item up", () => {
    expect(reorder(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("leaves the list alone when the move goes nowhere", () => {
    expect(reorder(list, 1, 1)).toEqual(list);
  });

  // The settings buttons are disabled at the ends, but a caller that gets it
  // wrong should get its list back rather than an undefined hole in it.
  it("refuses a move off either end", () => {
    expect(reorder(list, 0, -1)).toEqual(list);
    expect(reorder(list, 3, 4)).toEqual(list);
  });

  it("does not mutate the input", () => {
    const original = [...list];
    reorder(list, 0, 3);
    expect(list).toEqual(original);
  });
});
