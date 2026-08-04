import { addDays, dateKey, daysBetween, formatDateKey } from "@/lib/utils";

export type DateRange = { from: string; to: string };

/**
 * The report reads one Firestore document per day in the range, so an
 * unbounded range is an unbounded bill. A year of daily sheets is a data
 * export, not a report someone reads on screen.
 */
export const MAX_RANGE_DAYS = 92;

/** Every day in the range, newest first, clamped to `MAX_RANGE_DAYS`. */
export function datesInRange(range: DateRange): string[] {
  const span = Math.min(
    Math.max(0, daysBetween(range.from, range.to)),
    MAX_RANGE_DAYS - 1,
  );
  return Array.from({ length: span + 1 }, (_, i) => addDays(range.to, -i));
}

export function rangeLength(range: DateRange): number {
  return Math.max(0, daysBetween(range.from, range.to)) + 1;
}

/** The last `days` days, ending today. */
export function lastDays(days: number, today = dateKey()): DateRange {
  return { from: addDays(today, -(days - 1)), to: today };
}

/**
 * A whole calendar month, `offset` months back from today.
 *
 * The current month stops at today rather than running to the end of the
 * month: a report should not carry a tail of days that have not happened.
 */
export function calendarMonth(offset: number, today = dateKey()): DateRange {
  const [y, m] = today.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 + offset, 1));
  const end = new Date(Date.UTC(y, m + offset, 0));
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  return { from, to: to > today ? today : to };
}

/**
 * Puts a hand-edited range into a shape the report can honour.
 *
 * Swaps the ends if they are the wrong way round, then pulls `from` forward if
 * the span exceeds the cap. Clamping here rather than when the days are
 * expanded means the dates on screen are always the dates being reported on,
 * instead of quietly covering less than they claim.
 */
export function normaliseRange(range: DateRange): DateRange {
  const ordered =
    range.from > range.to ? { from: range.to, to: range.from } : range;

  if (rangeLength(ordered) <= MAX_RANGE_DAYS) return ordered;
  return { from: addDays(ordered.to, -(MAX_RANGE_DAYS - 1)), to: ordered.to };
}

export function formatRange(range: DateRange): string {
  if (range.from === range.to) return formatDateKey(range.from);
  return `${formatDateKey(range.from)} - ${formatDateKey(range.to)}`;
}
