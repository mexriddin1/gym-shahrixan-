import { describe, expect, it } from "vitest";

import type { Subscription } from "@/lib/db/types";
import {
  allowsWeekday,
  canCheckIn,
  computeEndDate,
  derivedStatus,
  endDateAfterUnfreeze,
  frozenDayCount,
  isoWeekday,
  visitsRemaining,
} from "./subscription";

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "s1",
    code: 1000,
    clientId: "c1",
    clientName: "Izzatullo Rahimov",
    tariffId: "t1",
    tariffName: "1 Oylik Standart",
    originalPrice: 300_000,
    discountType: "none",
    discountValue: 0,
    discountReason: null,
    finalPrice: 300_000,
    durationDays: 30,
    visitLimit: null,
    weeklyLimit: null,
    allowedWeekdays: null,
    isVip: false,
    visitsUsed: 0,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    endDateManual: false,
    status: "active",
    note: null,
    createdBy: null,
    createdAt: null as never,
    updatedAt: null as never,
    ...overrides,
  };
}

describe("derivedStatus", () => {
  it("is active in the middle of the term", () => {
    expect(derivedStatus(sub(), "2026-08-10")).toBe("active");
  });

  it("is pending before the start date", () => {
    expect(derivedStatus(sub(), "2026-07-30")).toBe("pending");
  });

  it("is expiring inside the warning window", () => {
    // endDate 2026-08-31, window 3 days.
    expect(derivedStatus(sub(), "2026-08-28")).toBe("expiring");
    expect(derivedStatus(sub(), "2026-08-31")).toBe("expiring");
  });

  it("is still active one day before the window opens", () => {
    expect(derivedStatus(sub(), "2026-08-27")).toBe("active");
  });

  it("is expired the day after the end date", () => {
    expect(derivedStatus(sub(), "2026-09-01")).toBe("expired");
  });

  it("honours a custom warning window", () => {
    expect(derivedStatus(sub(), "2026-08-25", 7)).toBe("expiring");
    expect(derivedStatus(sub(), "2026-08-25", 3)).toBe("active");
  });

  it("keeps a cancelled subscription cancelled even past its end date", () => {
    expect(derivedStatus(sub({ status: "cancelled" }), "2026-09-15")).toBe(
      "cancelled",
    );
  });

  it("keeps a frozen subscription frozen even inside the warning window", () => {
    expect(derivedStatus(sub({ status: "frozen" }), "2026-08-30")).toBe("frozen");
  });

  it("stays active forever when there is no end date", () => {
    expect(derivedStatus(sub({ endDate: null }), "2030-01-01")).toBe("active");
  });
});

describe("computeEndDate", () => {
  it("adds the duration to the start date", () => {
    expect(computeEndDate("2026-08-01", 30)).toBe("2026-08-31");
  });

  it("crosses a month boundary correctly", () => {
    expect(computeEndDate("2026-08-15", 30)).toBe("2026-09-14");
  });

  it("crosses a year boundary correctly", () => {
    expect(computeEndDate("2026-12-20", 30)).toBe("2027-01-19");
  });

  it("handles a leap day", () => {
    expect(computeEndDate("2028-02-01", 30)).toBe("2028-03-02");
  });

  it("returns null for a visit-only tariff", () => {
    expect(computeEndDate("2026-08-01", null)).toBeNull();
  });
});

describe("freezing", () => {
  it("counts whole frozen days", () => {
    expect(frozenDayCount("2026-08-10", "2026-08-17")).toBe(7);
  });

  it("counts zero for a same-day freeze and unfreeze", () => {
    expect(frozenDayCount("2026-08-10", "2026-08-10")).toBe(0);
  });

  it("never counts negative days", () => {
    expect(frozenDayCount("2026-08-17", "2026-08-10")).toBe(0);
  });

  it("pushes the end date back by the frozen days", () => {
    expect(endDateAfterUnfreeze("2026-08-31", 7)).toBe("2026-09-07");
  });

  it("leaves the end date alone when nothing was frozen", () => {
    expect(endDateAfterUnfreeze("2026-08-31", 0)).toBe("2026-08-31");
  });

  it("leaves an open-ended subscription open-ended", () => {
    expect(endDateAfterUnfreeze(null, 7)).toBeNull();
  });
});

describe("isoWeekday", () => {
  it("maps Monday to 1 and Sunday to 7", () => {
    expect(isoWeekday("2026-08-03")).toBe(1); // Monday
    expect(isoWeekday("2026-08-09")).toBe(7); // Sunday
  });
});

describe("allowsWeekday", () => {
  it("allows every day when unrestricted", () => {
    expect(allowsWeekday(null, "2026-08-09")).toBe(true);
    expect(allowsWeekday([], "2026-08-09")).toBe(true);
  });

  it("allows only the listed days", () => {
    expect(allowsWeekday([1, 3, 5], "2026-08-03")).toBe(true); // Monday
    expect(allowsWeekday([1, 3, 5], "2026-08-04")).toBe(false); // Tuesday
  });
});

describe("visitsRemaining", () => {
  it("is null for an unlimited tariff", () => {
    expect(visitsRemaining({ visitLimit: null, visitsUsed: 12 })).toBeNull();
  });

  it("counts down", () => {
    expect(visitsRemaining({ visitLimit: 12, visitsUsed: 5 })).toBe(7);
  });

  it("floors at zero when overused", () => {
    expect(visitsRemaining({ visitLimit: 12, visitsUsed: 15 })).toBe(0);
  });
});

describe("canCheckIn", () => {
  it("admits an active member", () => {
    expect(canCheckIn(sub(), "2026-08-10")).toEqual({ ok: true });
  });

  it("admits a member inside the expiry warning window", () => {
    expect(canCheckIn(sub(), "2026-08-30")).toEqual({ ok: true });
  });

  it("gives a reason for an expired subscription", () => {
    const result = canCheckIn(sub(), "2026-09-05");
    expect(result).toEqual({ ok: false, reason: "Abonement muddati tugagan" });
  });

  it("gives a reason for a frozen subscription", () => {
    const result = canCheckIn(sub({ status: "frozen" }), "2026-08-10");
    expect(result).toEqual({ ok: false, reason: "Abonement muzlatilgan" });
  });

  it("gives a reason when the visit limit is used up", () => {
    const result = canCheckIn(
      sub({ visitLimit: 12, visitsUsed: 12 }),
      "2026-08-10",
    );
    expect(result).toEqual({ ok: false, reason: "Tashriflar limiti tugagan" });
  });

  it("gives a reason on a day the tariff does not cover", () => {
    // 2026-08-09 is a Sunday; the tariff allows Mon/Wed/Fri only.
    const result = canCheckIn(sub({ allowedWeekdays: [1, 3, 5] }), "2026-08-09");
    expect(result).toEqual({
      ok: false,
      reason: "Bugun bu tarif bo'yicha kirish mumkin emas",
    });
  });
});
