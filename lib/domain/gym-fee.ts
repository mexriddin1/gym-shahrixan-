import type { DailySheetRow, GymFeeMode } from "@/lib/db/types";

/**
 * How a floor-fee cell should read once an amount has been typed into it.
 *
 * An amount always means cash was charged. Zero is the interesting case: it
 * can mean two different things depending on who the row belongs to.
 *
 * For a walk-in it means nothing was charged, and the cell is simply empty.
 * For a member whose subscription covers the day it means the single-day
 * charge was a mistake, so the cell goes back to reading "oylik" — the state
 * it was in before someone charged them for an extra visit. Without that, the
 * only way back from an accidental charge would be deleting the row, and the
 * sheet would show a member on a live subscription owing nothing for a reason
 * it could not name.
 */
export function gymFeeModeFor(
  amount: number,
  row: Pick<DailySheetRow, "clientId">,
  coveredToday: ReadonlySet<string>,
): GymFeeMode {
  if (amount > 0) return "cash";
  if (row.clientId && coveredToday.has(row.clientId)) return "subscription";
  return "none";
}
