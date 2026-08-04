"use client";

import { useMemo } from "react";
import { BasketIcon } from "@phosphor-icons/react";

import { getSettings, getSheetHistory } from "@/lib/db/queries";
import { useResource } from "@/lib/db/use-resource";
import { visitFromRow, walkInKey, type WalkInVisit } from "@/lib/domain/walk-ins";
import { cn, formatDateKey, formatSom } from "@/lib/utils";
import { SkeletonRows } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Pagination, usePagination } from "@/components/ui/pagination";

/** How far back the daily sheets are scanned. */
export const HISTORY_DAYS = 60;

/** Visits per page. A regular is in most days, so this fills up quickly. */
const PAGE_SIZE = 10;

/**
 * What this person bought, and when.
 *
 * Matched by member id where there is one, and by name for walk-ins, who have
 * no member record by design.
 */
export function PurchaseHistory({
  clientId,
  clientName,
}: {
  clientId?: string;
  clientName?: string;
}) {
  // Settings come along for the ride: the sheet stores custom charges by
  // column id, and only settings knows what those columns are called.
  const { data, loading, error, reload } = useResource(async () => {
    const [history, settings] = await Promise.all([
      getSheetHistory(HISTORY_DAYS),
      getSettings(),
    ]);
    return { history, columns: settings.sheetColumns };
  }, []);

  const visits = useMemo<WalkInVisit[]>(() => {
    if (!data) return [];
    const key = clientName ? walkInKey(clientName) : null;

    const out: WalkInVisit[] = [];
    for (const day of data.history) {
      for (const row of day.rows) {
        const mine = clientId
          ? row.clientId === clientId
          : row.clientId === null && walkInKey(row.clientName) === key;
        if (mine) out.push(visitFromRow(day.date, row, data.columns));
      }
    }
    return out;
  }, [data, clientId, clientName]);

  return (
    <VisitList
      visits={visits}
      loading={loading && !data}
      error={error}
      onRetry={reload}
    />
  );
}

/** The rendering half, so a page holding its own visits can reuse it. */
export function VisitList({
  visits,
  loading,
  error,
  onRetry,
}: {
  visits: WalkInVisit[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const spent = visits.reduce((s, v) => s + v.total, 0);
  const owed = visits.reduce((s, v) => s + v.owed, 0);
  // Totals above stay over the whole history; only the rows below are paged.
  const paged = usePagination(visits, PAGE_SIZE);

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">Xaridlar tarixi</h3>
        <p className="text-xs text-muted-foreground">
          So&apos;nggi {HISTORY_DAYS} kun
          {visits.length > 0 ? (
            <>
              {" · "}
              <span className="nums">{formatSom(spent)}</span> so&apos;m
              {owed > 0 ? (
                <>
                  {" · "}
                  <span className="nums text-status-debt-foreground">
                    {formatSom(owed)}
                  </span>{" "}
                  olinmagan
                </>
              ) : null}
            </>
          ) : null}
        </p>
      </div>

      <div className="overflow-hidden border border-border">
        {error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : loading ? (
          <SkeletonRows rows={3} />
        ) : visits.length === 0 ? (
          <EmptyState
            icon={BasketIcon}
            title="Xarid yo'q"
            description={`So'nggi ${HISTORY_DAYS} kun ichida hech narsa olinmagan.`}
          />
        ) : (
          <ul className="divide-y divide-grid-line">
            {paged.pageItems.map((v) => (
              <li key={v.date} className="px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="nums text-sm font-medium">
                    {formatDateKey(v.date)}
                  </span>
                  <span
                    className={cn(
                      "nums text-sm font-medium",
                      v.owed > 0 && "text-status-debt-foreground",
                    )}
                  >
                    {formatSom(v.total)}
                    {v.owed > 0 ? (
                      <span className="ml-1.5 text-xs font-normal">
                        ({formatSom(v.owed)} olinmagan)
                      </span>
                    ) : null}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {v.onSubscription ? (
                    <Chip label="Zal" note="oylik" tone="subscription" />
                  ) : v.gymFee > 0 ? (
                    <Chip label="Zal" note={formatSom(v.gymFee)} />
                  ) : null}

                  {v.items.map((item, i) => (
                    <Chip
                      key={`${item.name}-${i}`}
                      label={item.qty > 1 ? `${item.name} x${item.qty}` : item.name}
                      note={formatSom(item.total)}
                      tone={item.paid ? "paid" : undefined}
                    />
                  ))}

                  {v.extras.map((extra, i) => (
                    <Chip
                      key={`extra-${extra.name}-${i}`}
                      label={extra.name}
                      note={formatSom(extra.total)}
                      tone={extra.paid ? "paid" : undefined}
                    />
                  ))}

                  {v.items.length === 0 &&
                  v.extras.length === 0 &&
                  !v.onSubscription &&
                  v.gymFee === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      faqat tashrif
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination {...paged} onPageChange={paged.setPage} />
    </section>
  );
}

/**
 * One purchase. Yellow means the money is in, matching the highlighter on the
 * daily sheet, so the two screens can be read the same way.
 */
function Chip({
  label,
  note,
  tone,
}: {
  label: string;
  note: string;
  tone?: "paid" | "subscription";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.7rem]",
        tone === "paid"
          ? "bg-paid text-paid-foreground"
          : tone === "subscription"
            ? "bg-status-active text-status-active-foreground"
            : "bg-muted",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="nums font-medium">{note}</span>
    </span>
  );
}
