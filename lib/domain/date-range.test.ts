import { describe, expect, it } from "vitest";

import {
  calendarMonth,
  datesInRange,
  formatRange,
  lastDays,
  MAX_RANGE_DAYS,
  normaliseRange,
  rangeLength,
} from "./date-range";
import { timestampDay } from "@/lib/utils";

const TODAY = "2026-08-04";

describe("lastDays", () => {
  it("includes today, so 7 days ends today", () => {
    expect(lastDays(7, TODAY)).toEqual({ from: "2026-07-29", to: TODAY });
    expect(rangeLength(lastDays(7, TODAY))).toBe(7);
  });

  it("handles a single day", () => {
    expect(lastDays(1, TODAY)).toEqual({ from: TODAY, to: TODAY });
  });
});

describe("calendarMonth", () => {
  it("stops the current month at today rather than month end", () => {
    expect(calendarMonth(0, TODAY)).toEqual({ from: "2026-08-01", to: TODAY });
  });

  it("returns a whole past month", () => {
    expect(calendarMonth(-1, TODAY)).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("gets February right in a non-leap year", () => {
    expect(calendarMonth(-6, TODAY)).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("crosses the year boundary", () => {
    expect(calendarMonth(-8, TODAY)).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});

describe("datesInRange", () => {
  it("returns days newest first", () => {
    expect(datesInRange({ from: "2026-08-01", to: "2026-08-04" })).toEqual([
      "2026-08-04",
      "2026-08-03",
      "2026-08-02",
      "2026-08-01",
    ]);
  });

  it("returns the single day when both ends match", () => {
    expect(datesInRange({ from: TODAY, to: TODAY })).toEqual([TODAY]);
  });

  it("caps a very long range so the report cannot fan out unbounded", () => {
    const dates = datesInRange({ from: "2020-01-01", to: TODAY });
    expect(dates).toHaveLength(MAX_RANGE_DAYS);
    expect(dates[0]).toBe(TODAY);
  });

  it("yields nothing useful for a backwards range, which normaliseRange fixes", () => {
    const backwards = { from: TODAY, to: "2026-08-01" };
    expect(datesInRange(backwards)).toEqual(["2026-08-01"]);
    expect(datesInRange(normaliseRange(backwards))).toHaveLength(4);
  });
});

describe("normaliseRange", () => {
  it("swaps the ends when they are the wrong way round", () => {
    expect(normaliseRange({ from: "2026-08-04", to: "2026-08-01" })).toEqual({
      from: "2026-08-01",
      to: "2026-08-04",
    });
  });

  it("leaves a correct range alone", () => {
    const ok = { from: "2026-08-01", to: "2026-08-04" };
    expect(normaliseRange(ok)).toBe(ok);
  });

  it("pulls the start forward when the span is over the cap", () => {
    const huge = normaliseRange({ from: "2020-01-01", to: TODAY });
    expect(rangeLength(huge)).toBe(MAX_RANGE_DAYS);
    expect(huge.to).toBe(TODAY);
  });

  it("keeps the dates on screen honest about what is reported", () => {
    // The clamped range must expand to exactly the days it claims to cover.
    const huge = normaliseRange({ from: "2020-01-01", to: TODAY });
    expect(datesInRange(huge)).toHaveLength(rangeLength(huge));
  });
});

describe("formatRange", () => {
  it("collapses a single day to one date", () => {
    expect(formatRange({ from: TODAY, to: TODAY })).toBe("04.08.2026");
  });

  it("shows both ends otherwise", () => {
    expect(formatRange({ from: "2026-08-01", to: TODAY })).toBe(
      "01.08.2026 - 04.08.2026",
    );
  });
});

describe("timestampDay", () => {
  const stamp = (iso: string) => ({ toDate: () => new Date(iso) });

  it("files an early-morning payment under the local day, not the UTC one", () => {
    // 03:00 in Tashkent on the 5th is 22:00 UTC on the 4th. The UTC slice this
    // replaced put that payment on the previous day's report.
    expect(timestampDay(stamp("2026-08-04T22:00:00Z"))).toBe("2026-08-05");
  });

  it("agrees with the UTC day during working hours", () => {
    expect(timestampDay(stamp("2026-08-04T09:00:00Z"))).toBe("2026-08-04");
  });

  it("keeps a late-evening payment on the same day", () => {
    // 23:30 local is 18:30 UTC, same date either way.
    expect(timestampDay(stamp("2026-08-04T18:30:00Z"))).toBe("2026-08-04");
  });

  it("returns null when there is no timestamp", () => {
    expect(timestampDay(null)).toBeNull();
    expect(timestampDay(undefined)).toBeNull();
    expect(timestampDay({})).toBeNull();
  });
});
