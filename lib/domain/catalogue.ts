import type { Product } from "@/lib/db/types";

/** Sorts after everything that has been given a place. */
const UNORDERED = Number.MAX_SAFE_INTEGER;

/**
 * The order staff put the catalogue in, from Sozlamalar.
 *
 * Alphabetical was the wrong default. The desk reaches for the same few things
 * all day and thinks in groups — supplements, then food, then drinks — so an
 * order somebody chose beats an order the alphabet chose, both in the settings
 * list and in the picker on the daily sheet.
 *
 * A product saved before the order existed has no `position`. Those sort last,
 * by name, so a half-migrated catalogue reads sensibly instead of shuffling.
 */
export function byCatalogueOrder(
  a: Pick<Product, "position" | "name">,
  b: Pick<Product, "position" | "name">,
): number {
  const ap = a.position ?? UNORDERED;
  const bp = b.position ?? UNORDERED;
  return ap !== bp ? ap - bp : a.name.localeCompare(b.name, "uz");
}

/**
 * Moves one item to another index, returning a new array.
 *
 * Move rather than swap: dragging an item three places up should push the
 * three it passes down by one, not trade places with whatever sat at the far
 * end. With single-step buttons the two are identical, but the callers are not
 * the ones who should have to know that.
 */
export function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return next;
  }

  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
