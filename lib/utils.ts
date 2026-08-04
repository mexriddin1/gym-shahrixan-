import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** The gym runs on Tashkent time regardless of where the browser is. */
export const TIME_ZONE = "Asia/Tashkent";

const numberFormat = new Intl.NumberFormat("uz-UZ");

/** Plain grouped number: 65000 -> "65 000". */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** Money as shown in the sheet. No currency suffix, the column header carries it. */
export function formatSom(value: number): string {
  return numberFormat.format(Math.round(value));
}

/** Money with the unit, for totals and receipts. */
export function formatSomFull(value: number): string {
  return `${formatSom(value)} so'm`;
}

/**
 * Empty-cell placeholder. A regular hyphen, never an em-dash, and exported
 * so the choice stays in one place.
 */
export const EMPTY = "-";

/** 65000 -> "65 000"; null/0 -> "-". Used for every money cell in the grid. */
export function formatCell(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return EMPTY;
  return formatSom(value);
}

/** Date key used for daily sheets and Firestore document ids: "2026-08-03". */
export function dateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The gym's calendar day a Firestore timestamp falls on.
 *
 * Never reach for `toISOString().slice(0, 10)` here: that is the UTC day, and
 * the gym runs five hours ahead of it. Anything taken before 05:00 local time
 * would be filed against the previous day, so an early-morning payment would
 * land on yesterday's report and yesterday's takings would never close.
 */
export function timestampDay(
  value: { toDate?: () => Date } | null | undefined,
): string | null {
  const date = value?.toDate?.();
  return date ? dateKey(date) : null;
}

/** "2026-08-03" -> "03.08.2026", the format the workbook uses. */
export function formatDateKey(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

/** Short tab label for the daily sheet: "03.08". */
export function formatDayTab(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}.${m}`;
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("uz-UZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  });
}

/** Whole days between two date keys. Positive when `to` is later. */
export function daysBetween(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Adds days to a date key, returning a new key. */
export function addDays(key: string, days: number): string {
  const base = new Date(`${key}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Uzbek phone as stored in the workbook: "93-395-92-92". */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return EMPTY;
  const digits = phone.replace(/\D/g, "").replace(/^998/, "");
  if (digits.length !== 9) return phone;
  return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5, 7)}-${digits.slice(7)}`;
}
