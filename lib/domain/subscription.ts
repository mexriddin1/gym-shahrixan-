import { addDays, dateKey, daysBetween } from "@/lib/utils";
import type {
  DateKey,
  DerivedSubscriptionStatus,
  Subscription,
} from "@/lib/db/types";

/** v1 hard-coded 3. Here it is a setting, defaulting to the same value. */
export const DEFAULT_EXPIRING_DAYS = 3;

type StatusInput = Pick<Subscription, "status" | "startDate" | "endDate">;

/**
 * The status the UI shows, derived from dates. Only active/frozen/cancelled
 * are ever stored; expiring and expired are always computed, so a subscription
 * cannot go stale just because nothing wrote to it today.
 *
 * Ported from effectiveStatus() in gym/server/src/routes/subscriptions.js.
 * Order of the checks is load-bearing: a cancelled subscription stays
 * cancelled even after its end date passes.
 */
export function derivedStatus(
  sub: StatusInput,
  today: DateKey = dateKey(),
  expiringDays: number = DEFAULT_EXPIRING_DAYS,
): DerivedSubscriptionStatus {
  if (sub.status === "cancelled") return "cancelled";
  if (sub.status === "frozen") return "frozen";
  if (today < sub.startDate) return "pending";
  if (sub.endDate && today > sub.endDate) return "expired";
  if (sub.endDate && daysBetween(today, sub.endDate) <= expiringDays) {
    return "expiring";
  }
  return "active";
}

/**
 * Auto end date from a tariff duration. A manual override replaces this and
 * requires a reason, which the caller enforces.
 */
export function computeEndDate(
  startDate: DateKey,
  durationDays: number | null,
): DateKey | null {
  if (!durationDays) return null;
  return addDays(startDate, durationDays);
}

/**
 * Days a subscription spent frozen, used to push the end date back by the
 * same amount so a freeze never costs the member time they paid for.
 */
export function frozenDayCount(fromDate: DateKey, toDate: DateKey): number {
  return Math.max(0, daysBetween(fromDate, toDate));
}

/** End date after unfreezing. Unchanged when nothing was actually frozen. */
export function endDateAfterUnfreeze(
  endDate: DateKey | null,
  frozenDays: number,
): DateKey | null {
  if (!endDate || frozenDays <= 0) return endDate;
  return addDays(endDate, frozenDays);
}

/** Whether a subscription permits entry on a given day. */
export function allowsWeekday(
  allowedWeekdays: number[] | null,
  date: DateKey,
): boolean {
  if (!allowedWeekdays || allowedWeekdays.length === 0) return true;
  return allowedWeekdays.includes(isoWeekday(date));
}

/** 1 = Monday .. 7 = Sunday. */
export function isoWeekday(date: DateKey): number {
  const g = new Date(`${date}T00:00:00Z`).getUTCDay();
  return g === 0 ? 7 : g;
}

/** Visits left, or null when the tariff is unlimited. */
export function visitsRemaining(
  sub: Pick<Subscription, "visitLimit" | "visitsUsed">,
): number | null {
  if (sub.visitLimit === null) return null;
  return Math.max(0, sub.visitLimit - sub.visitsUsed);
}

/**
 * Whether the member can check in right now, and why not when they cannot.
 * The desk needs the reason, not just a boolean.
 */
export function canCheckIn(
  sub: Subscription,
  today: DateKey = dateKey(),
  expiringDays: number = DEFAULT_EXPIRING_DAYS,
): { ok: true } | { ok: false; reason: string } {
  const status = derivedStatus(sub, today, expiringDays);

  if (status === "cancelled") return { ok: false, reason: "Abonement bekor qilingan" };
  if (status === "frozen") return { ok: false, reason: "Abonement muzlatilgan" };
  if (status === "pending") return { ok: false, reason: "Abonement hali boshlanmagan" };
  if (status === "expired") return { ok: false, reason: "Abonement muddati tugagan" };

  const left = visitsRemaining(sub);
  if (left !== null && left <= 0) {
    return { ok: false, reason: "Tashriflar limiti tugagan" };
  }
  if (!allowsWeekday(sub.allowedWeekdays, today)) {
    return { ok: false, reason: "Bugun bu tarif bo'yicha kirish mumkin emas" };
  }
  return { ok: true };
}
