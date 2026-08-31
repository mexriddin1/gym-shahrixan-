/**
 * One spelling per person, whatever was typed at the desk.
 *
 * The counter is a hurried place: the same member arrives as "ali valiv",
 * "ALI VALIV" and "ali  Valiv" depending on who is on shift. Firestore has no
 * case-insensitive index, so those are three different people to every search
 * box in the app and the member gets registered three times.
 *
 * Normalising on the way in - not on the way out - means the members list, the
 * daily sheet, the receipt and the search all read the same name, and the
 * value stored is the one a human would have written.
 */

/** Apostrophes, straight and curly. Part of a letter in Uzbek, not a break. */
const APOSTROPHE = /['‘’ʻʼ]/;

/**
 * "ali" -> "Ali", "(dom)" -> "(Dom)", "abdulla-aziz" -> "Abdulla-Aziz".
 *
 * A letter is capitalised when nothing but a non-letter precedes it - so a
 * bracket, a hyphen or a dot all start a new word. The apostrophe is the one
 * exception: in Uzbek Latin it is part of the letters o' and g', so "o'ktam"
 * is one word and must not come back as "O'Ktam".
 *
 * Walked character by character with `Array.from` rather than indexed, because
 * a string index would cut a surrogate pair in half.
 */
function capitalise(part: string): string {
  let atWordStart = true;
  return Array.from(part.toLowerCase())
    .map((ch) => {
      const isLetter = /\p{L}/u.test(ch);
      const out = atWordStart && isLetter ? ch.toUpperCase() : ch;
      if (isLetter) atWordStart = false;
      else if (!APOSTROPHE.test(ch)) atWordStart = true;
      return out;
    })
    .join("");
}

/**
 * A name as it is stored: "  ALI   valiv " -> "Ali Valiv".
 *
 * Only the spacing is normalised here; `capitalise` decides where a word
 * begins, so hyphens and brackets need no special handling at this level.
 */
export function normalisePersonName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map(capitalise)
    .join(" ");
}

/** The same rule for an optional field: blank stays null rather than "". */
export function normaliseOptionalName(
  input: string | null | undefined,
): string | null {
  return normalisePersonName(input ?? "") || null;
}
