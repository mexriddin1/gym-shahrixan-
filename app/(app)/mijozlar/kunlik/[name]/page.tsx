"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, CalendarBlankIcon } from "@phosphor-icons/react";

import { getSettings, getSheetHistory } from "@/lib/db/queries";
import { useResource } from "@/lib/db/use-resource";
import { collectWalkIns } from "@/lib/domain/walk-ins";
import { formatDateKey, formatSom } from "@/lib/utils";
import { HISTORY_DAYS, VisitList } from "@/components/app/purchase-history";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";

/**
 * One walk-in, identified by name.
 *
 * There is no member record behind this page, so the name in the URL is the
 * key. Every row on every recent sheet carrying that name belongs to the same
 * person, which is what makes a repeat visitor visible without registering them.
 */
export default function WalkInDetailPage() {
  const { name } = useParams<{ name: string }>();
  const key = decodeURIComponent(name);

  const { data, loading, error, reload } = useResource(async () => {
    const [history, settings] = await Promise.all([
      getSheetHistory(HISTORY_DAYS),
      getSettings(),
    ]);
    return collectWalkIns(history, settings.sheetColumns);
  }, []);

  const walkIn = data?.find((w) => w.key === key) ?? null;

  const back = (
    <Button
      variant="ghost"
      size="sm"
      render={<Link href="/mijozlar" />}
      className="-ml-2 mb-2 text-muted-foreground"
    >
      <ArrowLeftIcon />
      Mijozlar
    </Button>
  );

  if (error) return <ErrorState message={error} onRetry={reload} />;

  if (loading && !data) {
    return (
      <div className="space-y-5">
        {back}
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!walkIn) {
    return (
      <div>
        {back}
        <EmptyState
          icon={CalendarBlankIcon}
          title="Kunlik mijoz topilmadi"
          description={`So'nggi ${HISTORY_DAYS} kun ichida bu ism kunlik varaqada uchramadi.`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        {back}
        <h2 className="text-base font-semibold tracking-tight">{walkIn.name}</h2>
        <p className="nums mt-0.5 text-sm text-muted-foreground">
          Kunlik mijoz · {walkIn.visits.length} tashrif
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-grid-line sm:grid-cols-4">
        <Fact label="Birinchi tashrif" value={formatDateKey(walkIn.firstVisit)} />
        <Fact label="Oxirgi tashrif" value={formatDateKey(walkIn.lastVisit)} />
        <Fact label="Jami" value={formatSom(walkIn.spent)} />
        <Fact
          label="Olinmagan"
          value={walkIn.owed > 0 ? formatSom(walkIn.owed) : "-"}
          tone={walkIn.owed > 0 ? "debt" : undefined}
        />
      </dl>

      <VisitList visits={walkIn.visits} />
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "debt";
}) {
  return (
    <div className="bg-card px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          tone === "debt"
            ? "nums mt-0.5 text-sm font-medium text-status-debt-foreground"
            : "nums mt-0.5 text-sm"
        }
      >
        {value}
      </dd>
    </div>
  );
}
