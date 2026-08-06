import { describe, expect, it } from "vitest";

import { gymFeeModeFor } from "./gym-fee";

const MEMBER = { clientId: "c1" };
const WALK_IN = { clientId: null };
const covered = new Set(["c1"]);

describe("gymFeeModeFor", () => {
  it("charges cash whenever there is an amount", () => {
    expect(gymFeeModeFor(30_000, MEMBER, covered)).toBe("cash");
    expect(gymFeeModeFor(30_000, WALK_IN, covered)).toBe("cash");
  });

  // The fourth visit in a week the monthly rate covers three of: charged on
  // the day, and cleared back to "oylik" if it turns out to be wrong.
  it("returns a covered member to oylik when the fee is cleared", () => {
    expect(gymFeeModeFor(0, MEMBER, covered)).toBe("subscription");
  });

  it("leaves a walk-in's cleared cell empty rather than claiming a subscription", () => {
    expect(gymFeeModeFor(0, WALK_IN, covered)).toBe("none");
  });

  // A member whose subscription has run out is charged like anyone else, and
  // clearing the cell must not hand them a subscription they no longer hold.
  it("does not return an uncovered member to oylik", () => {
    expect(gymFeeModeFor(0, { clientId: "c2" }, covered)).toBe("none");
  });

  it("treats an empty covered set as nobody being on a subscription", () => {
    expect(gymFeeModeFor(0, MEMBER, new Set())).toBe("none");
  });
});
