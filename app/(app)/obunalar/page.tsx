"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CheckCircleIcon } from "@phosphor-icons/react";

import { getSettings, listAllSubscriptions, listClients } from "@/lib/db/queries";
import type { Client, Subscription } from "@/lib/db/types";
import { useResource } from "@/lib/db/use-resource";
import { derivedStatus } from "@/lib/domain/subscription";
import {
  cn,
  dateKey,
  daysBetween,
  formatDateKey,
  formatPhone,
  formatSom,
} from "@/lib/utils";
import { PageHeader } from "@/components/app/app-shell";
import { SkeletonRows } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Pagination, usePagination } from "@/components/ui/pagination";

type Row = {
  sub: Subscription;
  client: Client | null;
  /** Negative once the date has passed. */
  daysLeft: number;
  expired: boolean;
};

/**
 * Who to call, and in what order.
 *
 * The point of this screen is the phone number: these are the members whose
 * subscription is about to run out, soonest first. Anyone already past their
 * date is greyed and sits below, because chasing them is a different, colder
 * conversation. Archived members never appear.
 */
export default function SubscriptionsPage() {
  const today = dateKey();

  const { data, loading, error, reload } = useResource(async () => {
    const [subs, clients, settings] = await Promise.all([
      listAllSubscriptions(),
      listClients(),
      getSettings(),
    ]);
    return { subs, clients, settings };
  }, []);

  const { soon, expired, windowDays } = useMemo(() => {
    if (!data) return { soon: [], expired: [], windowDays: 3 };
    const warn = data.settings.expiryWarningDays;
    // listClients already drops archived members, so anyone parked in the
    // archive never reaches this list.
    const byId = new Map(data.clients.map((c) => [c.id, c]));

    // Only the newest subscription per member counts. Someone who renewed
    // early is not expiring, whatever their old one says.
    const latest = new Map<string, Subscription>();
    for (const s of data.subs) {
      if (s.status === "cancelled") continue;
      const cur = latest.get(s.clientId);
      if (!cur || s.startDate > cur.startDate) latest.set(s.clientId, s);
    }

    const rows: Row[] = [];
    for (const sub of latest.values()) {
      if (!sub.endDate) continue;
      if (!byId.has(sub.clientId)) continue;
      const status = derivedStatus(sub, today, warn);
      if (status !== "expiring" && status !== "expired") continue;
      rows.push({
        sub,
        client: byId.get(sub.clientId) ?? null,
        daysLeft: daysBetween(today, sub.endDate),
        expired: status === "expired",
      });
    }

    return {
      soon: rows.filter((r) => !r.expired).sort((a, b) => a.daysLeft - b.daysLeft),
      expired: rows
        .filter((r) => r.expired)
        .sort((a, b) => b.daysLeft - a.daysLeft),
      windowDays: warn,
    };
  }, [data, today]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Obunasi tugayotganlar"
        subtitle={`${windowDays} kun ichida tugaydigan va muddati o'tgan abonementlar`}
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <ExpirySection
            title="Tugayapti"
            rows={soon}
            empty={
              <EmptyState
                icon={CheckCircleIcon}
                title="Tugayotgan abonement yo'q"
                description={`Keyingi ${windowDays} kun ichida hech kimning muddati tugamaydi.`}
              />
            }
          />

          {expired.length > 0 ? (
            <ExpirySection title="Muddati o'tgan" rows={expired} past />
          ) : null}
        </>
      )}
    </div>
  );
}

function ExpirySection({
  title,
  rows,
  past = false,
  empty,
}: {
  title: string;
  rows: Row[];
  /** These dates have already gone by, which changes both tone and tense. */
  past?: boolean;
  empty?: React.ReactNode;
}) {
  const paged = usePagination(rows, 15);

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold tracking-tight">
        {title}
        <span className="nums ml-2 text-xs font-normal text-muted-foreground">
          {rows.length}
        </span>
      </h3>

      <div className="overflow-x-auto border border-border">
        {rows.length === 0 ? (
          empty
        ) : (
          <table className="w-full table-fixed border-collapse text-xs">
            <colgroup>
              <col />
              <col className="w-36" />
              <col className="w-40" />
              <col className="w-32" />
              <col className="w-28" />
            </colgroup>

            <thead>
              <tr className="bg-grid-header">
                <Th className="text-left">Mijoz</Th>
                <Th className="text-left">Telefon</Th>
                <Th className="text-left">Tarif</Th>
                {/* The date is in the future in one section and the past in
                    the other, so the heading cannot be one word for both. */}
                <Th className="text-right">{past ? "Tugagan" : "Tugaydi"}</Th>
                <Th className="text-right">Summa</Th>
              </tr>
            </thead>

            <tbody>
              {paged.pageItems.map(({ sub, client, daysLeft, expired }) => {
                const when = expired
                  ? `${Math.abs(daysLeft)} kun oldin`
                  : daysLeft === 0
                    ? "Bugun"
                    : `${daysLeft} kundan keyin`;

                return (
                  <tr
                    key={sub.id}
                    className={cn(
                      "border-b border-grid-line last:border-0 hover:bg-grid-row-hover",
                      // Past members are greyed rather than coloured: a record
                      // to work through later, not something to act on now.
                      past && "text-muted-foreground",
                    )}
                  >
                    <Td className="text-left">
                      <Link
                        href={`/mijozlar/${sub.clientId}`}
                        className={cn(
                          "font-medium hover:underline",
                          past && "text-muted-foreground",
                        )}
                      >
                        {sub.clientName}
                      </Link>
                    </Td>
                    <Td className="nums text-left">
                      {client?.phone ? (
                        <a
                          href={`tel:+998${client.phone}`}
                          className="text-muted-foreground hover:underline"
                        >
                          {formatPhone(client.phone)}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </Td>
                    <Td className="truncate text-left text-muted-foreground">
                      {sub.tariffName}
                    </Td>
                    <Td className="text-right">
                      <span
                        className={cn(
                          "nums block font-medium",
                          past
                            ? "text-muted-foreground"
                            : daysLeft <= 0
                              ? "text-destructive"
                              : "text-status-warning-foreground",
                        )}
                      >
                        {sub.endDate ? formatDateKey(sub.endDate) : "-"}
                      </span>
                      <span className="block text-[0.7rem] text-muted-foreground">
                        {when}
                      </span>
                    </Td>
                    <Td className="nums text-right">{formatSom(sub.finalPrice)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination {...paged} onPageChange={paged.setPage} />
    </section>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "h-8 border-r border-b border-grid-line px-2 align-middle",
        "text-[0.7rem] font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase",
        "last:border-r-0",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "h-row-lg border-r border-grid-line px-2 align-middle last:border-r-0",
        className,
      )}
    >
      {children}
    </td>
  );
}
