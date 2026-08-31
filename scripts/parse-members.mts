/**
 * Parses the August 2026 member list into structured records.
 *
 * The source is a chat paste of a spreadsheet, so the columns are separated by
 * runs of whitespace and half of them are optional. Rather than counting
 * positions - which breaks on the first row missing a price - each token is
 * classified by its shape: a date looks like a date, a phone looks like a
 * phone, and nothing else does.
 *
 * Nothing here writes to Firestore. `import-members.mts` does that, and reads
 * what this produces, so the parse can be checked on its own first.
 *
 * `members-2026-08.txt` is deliberately NOT in the repository: it is 179
 * people's names and phone numbers and this repository is public. Drop the
 * list beside this file to re-run the parse.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

export type ParsedMember = {
  /** The number in the left-hand column, where the row had one. */
  no: number | null;
  name: string;
  /**
   * Digits only, no separators. null when the row carried no number.
   *
   * Not forced to nine: a couple of rows in the source are short a digit, and
   * a number that is wrong is still worth keeping where somebody can see and
   * fix it. `phoneSuspect` marks those.
   */
  phone: string | null;
  /** The phone is not nine digits, so it needs a human to look at it. */
  phoneSuspect: boolean;
  /** So'm, as an integer. null when the price column was blank. */
  price: number | null;
  /** "1OY", "1 oy" and so on all normalise to 30 days. */
  durationDays: number | null;
  startDate: string | null;
  endDate: string | null;
  /** "klik" where the row named it, otherwise cash. */
  method: "cash" | "click";
  /** The tick in the last column. Only these rows get imported. */
  paid: boolean;
  /** Anything the parse could not account for, for review. */
  leftovers: string[];
  raw: string;
};

const DATE = /^(\d{1,2}),(\d{1,2}),(\d{4}),?$/;
const PHONE = /^\+?[\d]{2,3}(-\d{2,4}){2,4}$/;
const PRICE = /^\d{1,3}(\s\d{3})+$/;
const DURATION = /^(\d+)\s*oy$/i;
const CLICK = /^klik\\?$/i;
/** A bare number in the payment column: a part payment, not a method. */
const BARE_AMOUNT = /^\d{4,}$/;

/** "01,08,2026" -> "2026-08-01". Returns null on a date that is not one. */
function toDateKey(token: string): string | null {
  const m = DATE.exec(token);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Digits only, with a country code stripped back off.
 *
 * The 998 prefix is only removed from a twelve-digit number. Stripping it
 * unconditionally ate the start of "99-850-68-07", which is a local number
 * that merely happens to begin with those three digits.
 */
function toPhone(token: string): string | null {
  const raw = token.replace(/\D/g, "");
  const digits = raw.length === 12 && raw.startsWith("998") ? raw.slice(3) : raw;
  return digits.length >= 7 ? digits : null;
}

export function parseLine(raw: string): ParsedMember | null {
  const line = raw.replace(/\s+$/, "");
  if (!line.trim()) return null;

  // Two or more spaces is a column break; a single space is inside a value
  // ("500 000", "KARIMOV ULUGBEK").
  const tokens = line.split(/\s{2,}/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return null;

  let no: number | null = null;
  let name: string | null = null;
  let phone: string | null = null;
  let price: number | null = null;
  let durationDays: number | null = null;
  const dates: string[] = [];
  let method: "cash" | "click" = "cash";
  let paid = false;
  const leftovers: string[] = [];

  for (const token of tokens) {
    if (token === "+") {
      paid = true;
      continue;
    }
    // A leading bare integer is the row number. Anywhere else it is not.
    if (no === null && name === null && /^\d{1,3}$/.test(token)) {
      no = Number(token);
      continue;
    }
    const date = toDateKey(token);
    if (date) {
      dates.push(date);
      continue;
    }
    if (DURATION.test(token)) {
      durationDays = Number(DURATION.exec(token)![1]) * 30;
      continue;
    }
    if (PRICE.test(token)) {
      price = Number(token.replace(/\s/g, ""));
      continue;
    }
    if (CLICK.test(token)) {
      method = "click";
      continue;
    }
    if (PHONE.test(token)) {
      const p = toPhone(token);
      if (p) {
        phone = p;
        continue;
      }
      // Right shape, far too few digits - kept visible rather than dropped.
      leftovers.push(token);
      continue;
    }
    if (BARE_AMOUNT.test(token)) {
      // A part payment written into the method column. Not a price, and not
      // silently discarded either.
      leftovers.push(`qisman to'lov: ${token}`);
      continue;
    }
    if (name === null) {
      name = token;
      continue;
    }
    // A name typed with a double space inside it ("Muxammadazizov  Izzatullo")
    // reads as two columns. Anything after the name that carries no digits is
    // the rest of the name, not a column the parse failed to understand.
    if (!/\d/.test(token)) {
      name = `${name} ${token}`;
      continue;
    }
    leftovers.push(token);
  }

  if (!name) return null;

  return {
    no,
    name: name.replace(/\s+/g, " ").trim(),
    phone,
    phoneSuspect: phone !== null && phone.length !== 9,
    price,
    durationDays,
    startDate: dates[0] ?? null,
    endDate: dates[1] ?? null,
    method,
    paid,
    leftovers,
    raw: line.trim(),
  };
}

export function parseAll(): ParsedMember[] {
  const text = readFileSync(join(HERE, "members-2026-08.txt"), "utf8");
  return text
    .split(/\r?\n/)
    .map(parseLine)
    .filter((m): m is ParsedMember => m !== null);
}

/* Run directly to print what the parse produced, without touching Firestore. */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!)) {
  const all = parseAll();
  const kept = all.filter((m) => m.paid);

  console.log(`Jami satr:        ${all.length}`);
  console.log(`"+" belgilangan:  ${kept.length}`);
  console.log(`Olinmaydi:        ${all.length - kept.length}`);
  console.log("");

  const noPrice = kept.filter((m) => m.price === null);
  const noDates = kept.filter((m) => !m.startDate || !m.endDate);
  const noPhone = kept.filter((m) => !m.phone);
  const badPhone = kept.filter((m) => m.phoneSuspect);
  const odd = kept.filter((m) => m.leftovers.length > 0);

  const seen = new Map<string, ParsedMember[]>();
  for (const m of kept) {
    const key = m.name.toLowerCase().replace(/[^a-z ]/g, "").trim();
    seen.set(key, [...(seen.get(key) ?? []), m]);
  }
  const dupes = [...seen.values()].filter((g) => g.length > 1);

  console.log(`Narxi yo'q:       ${noPrice.length}`);
  console.log(`Sanasi to'liqmas: ${noDates.length}`);
  console.log(`Telefoni yo'q:    ${noPhone.length}`);
  console.log(`Telefoni shubhali:${badPhone.length}`);
  console.log(`Tushunilmagan:    ${odd.length}`);
  console.log(`Takrorlangan ism: ${dupes.length}`);
  console.log("");

  if (process.argv.includes("--full")) {
    for (const m of kept) {
      console.log(
        [
          String(m.no ?? "-").padStart(4),
          m.name.padEnd(44).slice(0, 44),
          (m.phone ?? "-").padStart(9),
          (m.price === null ? "-" : m.price.toLocaleString("ru-RU")).padStart(9),
          (m.startDate ?? "-").padStart(10),
          (m.endDate ?? "-").padStart(10),
          m.method,
          m.leftovers.length ? `  ?? ${m.leftovers.join(" | ")}` : "",
        ].join("  "),
      );
    }
    console.log("");
  }

  if (noPrice.length) {
    console.log("--- Narxi yo'q, lekin + qilingan ---");
    for (const m of noPrice) console.log(`  ${m.no ?? "-"}  ${m.name}`);
    console.log("");
  }
  if (badPhone.length) {
    console.log("--- Telefon raqami 9 xonali emas ---");
    for (const m of badPhone) console.log(`  ${m.no ?? "-"}  ${m.name}  ->  ${m.phone}`);
    console.log("");
  }
  if (odd.length) {
    console.log("--- Tushunilmagan ustunlar ---");
    for (const m of odd) console.log(`  ${m.no ?? "-"}  ${m.name}  ->  ${m.leftovers.join(" | ")}`);
    console.log("");
  }
  if (dupes.length) {
    console.log("--- Takrorlangan ismlar ---");
    for (const g of dupes) {
      console.log(`  ${g.map((m) => `#${m.no ?? "-"} ${m.name} (${m.startDate})`).join("   |   ")}`);
    }
    console.log("");
  }
  if (noDates.length) {
    console.log("--- Sanasi to'liq emas ---");
    for (const m of noDates) console.log(`  ${m.no ?? "-"}  ${m.name}  ${m.startDate} -> ${m.endDate}`);
  }
}
