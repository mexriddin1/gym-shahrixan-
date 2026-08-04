"use client";

import { useMemo, useState } from "react";

import {
  getSheetRowsForDates,
  listAllSubscriptions,
  listClients,
  listDebtors,
  listPayments,
} from "@/lib/db/queries";
import { rowTotal } from "@/lib/db/types";
import { useResource } from "@/lib/db/use-resource";
import {
  addDays,
  cn,
  dateKey,
  formatDateKey,
  formatSom,
  timestampDay,
} from "@/lib/utils";
import {
  calendarMonth,
  datesInRange,
  formatRange,
  lastDays,
  MAX_RANGE_DAYS,
  normaliseRange,
  rangeLength,
  type DateRange,
} from "@/lib/domain/date-range";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { Pagination, usePagination } from "@/components/ui/pagination";

/**
 * Named ranges, resolved against today rather than stored as dates.
 *
 * "O'tgan oy" has to mean the previous calendar month whenever it is picked,
 * not the month it happened to be when the option was written.
 */
const PRESETS = [
  { value: "7", label: "7 kun", range: (t: string) => lastDays(7, t) },
  { value: "14", label: "14 kun", range: (t: string) => lastDays(14, t) },
  { value: "30", label: "30 kun", range: (t: string) => lastDays(30, t) },
  { value: "month", label: "Bu oy", range: (t: string) => calendarMonth(0, t) },
  {
    value: "prev-month",
    label: "O'tgan oy",
    range: (t: string) => calendarMonth(-1, t),
  },
  {
    value: "prev-2",
    label: "2 oy oldin",
    range: (t: string) => calendarMonth(-2, t),
  },
] as const;

/**
 * The report, deliberately as plain tables.
 *
 * Three questions, in the order an owner asks them: what came in each day,
 * what sold, and how the membership is moving. No tiles, no percentage bars,
 * no share-of-total columns; those looked like a dashboard and told nobody
 * anything they could act on.
 */
export default function ReportPage() {
  const today = dateKey();
  const [range, setRange] = useState<DateRange>(() => lastDays(14, today));

  // Which preset the current range corresponds to, or "" once the dates have
  // been edited by hand. Derived rather than stored, so the two cannot drift.
  const preset =
    PRESETS.find((p) => {
      const r = p.range(today);
      return r.from === range.from && r.to === range.to;
    })?.value ?? "";

  const { data, loading, error, reload } = useResource(async () => {
    const dates = datesInRange(range);
    const [sheet, payments, subs, clients, debtors] = await Promise.all([
      getSheetRowsForDates(dates),
      listPayments(),
      listAllSubscriptions(),
      listClients(),
      listDebtors(),
    ]);
    const sheets = dates.map((d) => ({ rows: sheet.rows.get(d) ?? [] }));
    // The dates travel with their sheets. Deriving them separately let the two
    // fall out of step while a longer range was still loading, and the report
    // read past the end of the array.
    return { dates, sheets, payments, subs, clients, debtors };
  }, [range.from, range.to]);

  const daily = useMemo(() => {
    if (!data) return [];
    return data.dates.map((date, i) => {
      const sheet = data.sheets[i];
      const takings = sheet.rows.reduce((s, r) => s + rowTotal(r), 0);
      const products = sheet.rows.reduce(
        (s, r) => s + r.items.reduce((n, item) => n + item.lineTotal, 0),
        0,
      );
      const subscriptions = data.payments
        .filter((p) => timestampDay(p.paidAt) === date)
        .reduce((s, p) => s + p.amount, 0);

      return {
        date,
        visitors: sheet.rows.length,
        products,
        floor: takings - products,
        subscriptions,
        total: takings + subscriptions,
      };
    });
  }, [data]);

  /** Everything sold across the period, biggest earner first. */
  const sold = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { qty: number; revenue: number }>();
    for (const sheet of data.sheets) {
      for (const row of sheet.rows) {
        for (const item of row.items) {
          const cur = map.get(item.productName) ?? { qty: 0, revenue: 0 };
          map.set(item.productName, {
            qty: cur.qty + item.qty,
            revenue: cur.revenue + item.lineTotal,
          });
        }
      }
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  /** How the membership moved: who is paying, who arrived, who lapsed. */
  const members = useMemo(() => {
    if (!data) return null;
    const from = data.dates[data.dates.length - 1];

    // Latest subscription per member decides whether they are still with us.
    const latest = new Map<string, (typeof data.subs)[number]>();
    for (const s of data.subs) {
      const cur = latest.get(s.clientId);
      if (!cur || s.startDate > cur.startDate) latest.set(s.clientId, s);
    }

    let active = 0;
    let lapsed = 0;
    for (const sub of latest.values()) {
      if (sub.status === "cancelled") continue;
      if (!sub.endDate || sub.endDate >= today) active++;
      else lapsed++;
    }

    const payers = new Set(
      data.payments
        .filter((p) => {
          const day = timestampDay(p.paidAt) ?? "";
          return day >= from && p.clientId;
        })
        .map((p) => p.clientId),
    ).size;

    const joined = data.subs.filter((s) => s.startDate >= from).length;

    return {
      registered: data.clients.length,
      active,
      lapsed,
      payers,
      joined,
      withoutSubscription: data.clients.length - latest.size,
    };
  }, [data, today]);

  const totals = daily.reduce(
    (a, r) => ({
      visitors: a.visitors + r.visitors,
      products: a.products + r.products,
      floor: a.floor + r.floor,
      subscriptions: a.subscriptions + r.subscriptions,
      total: a.total + r.total,
    }),
    { visitors: 0, products: 0, floor: 0, subscriptions: 0, total: 0 },
  );

  const outstanding = (data?.debtors ?? []).reduce((s, d) => s + d.debt, 0);

  // Rows off the current page are hidden rather than dropped, so «Chop etish»
  // still prints the whole range. Slicing them away would silently shorten the
  // printed report to whatever page happened to be on screen.
  const dailyPaged = usePagination(daily, 31);
  const onPage = (i: number) =>
    i >= dailyPaged.page * 31 && i < (dailyPaged.page + 1) * 31;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hisobot"
        subtitle={`${formatRange(range)} · ${rangeLength(range)} kun`}
        actions={
          <>
            <Select
              value={preset}
              onChange={(e) => {
                const next = PRESETS.find((p) => p.value === e.target.value);
                if (next) setRange(next.range(today));
              }}
              aria-label="Davr"
              className="w-32"
            >
              {/* Only reachable by editing the dates, so it is not selectable. */}
              {preset === "" ? (
                <option value="" disabled>
                  Tanlangan davr
                </option>
              ) : null}
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>

            {/* Native date inputs: the calendar is the one the desk already
                knows, and it needs no picker library. */}
            <Input
              type="date"
              value={range.from}
              max={range.to}
              // The calendar itself greys out anything past the cap, so the
              // clamp in normaliseRange stays a backstop rather than a surprise.
              min={addDays(range.to, -(MAX_RANGE_DAYS - 1))}
              aria-label="Boshlanish sanasi"
              onChange={(e) =>
                e.target.value &&
                setRange((r) => normaliseRange({ ...r, from: e.target.value }))
              }
              className="nums w-36"
            />
            <Input
              type="date"
              value={range.to}
              max={today}
              aria-label="Tugash sanasi"
              onChange={(e) =>
                e.target.value &&
                setRange((r) => normaliseRange({ ...r, to: e.target.value }))
              }
              className="nums w-36"
            />

            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="print:hidden"
            >
              Chop etish
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : (
        <>
          {/* Mijozlar */}
          {members ? (
            <Section title="Mijozlar">
              <table className="w-full table-fixed border-collapse text-xs">
                <tbody>
                  <StatRow label="Ro'yxatdagi mijozlar" value={members.registered} />
                  <StatRow label="Faol abonementi bor" value={members.active} />
                  <StatRow
                    label="Muddati tugagan, yangilamagan"
                    value={members.lapsed}
                    tone={members.lapsed > 0 ? "warn" : undefined}
                  />
                  <StatRow
                    label={`Shu davrda to'lov qilgan`}
                    value={members.payers}
                  />
                  <StatRow label="Shu davrda yangi olgan" value={members.joined} />
                  <StatRow
                    label="Abonementsiz"
                    value={members.withoutSubscription}
                  />
                </tbody>
              </table>
            </Section>
          ) : null}

          {/* Sotilgan mahsulotlar */}
          <Section title="Sotilgan mahsulotlar">
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col />
                <col className="w-24" />
                <col className="w-32" />
              </colgroup>
              <thead>
                <tr className="bg-grid-header">
                  <Th className="text-left">Mahsulot</Th>
                  <Th className="text-right">Soni</Th>
                  <Th className="text-right">Summa</Th>
                </tr>
              </thead>
              <tbody>
                {sold.length === 0 ? (
                  <tr>
                    <Td colSpan={3} className="text-center text-muted-foreground">
                      Bu davrda mahsulot sotilmagan
                    </Td>
                  </tr>
                ) : (
                  sold.map((p) => (
                    <tr
                      key={p.name}
                      className="border-b border-grid-line last:border-0"
                    >
                      <Td className="text-left">{p.name}</Td>
                      <Td className="nums text-right text-muted-foreground">
                        {p.qty}
                      </Td>
                      <Td className="nums text-right font-medium">
                        {formatSom(p.revenue)}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
              {sold.length > 0 ? (
                <tfoot>
                  <tr className="border-t-2 border-border bg-grid-header font-medium">
                    <Td className="text-left">Jami</Td>
                    <Td className="nums text-right">
                      {sold.reduce((s, p) => s + p.qty, 0)}
                    </Td>
                    <Td className="nums text-right font-semibold">
                      {formatSom(sold.reduce((s, p) => s + p.revenue, 0))}
                    </Td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </Section>

          {/* Kunlik tushum */}
          <Section title="Kunlik tushum">
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col className="w-28" />
                <col className="w-24" />
                <col />
                <col />
                <col />
                <col className="w-32" />
              </colgroup>
              <thead>
                <tr className="bg-grid-header">
                  <Th className="text-left">Sana</Th>
                  <Th className="text-right">Kelganlar</Th>
                  <Th className="text-right">Mahsulot</Th>
                  <Th className="text-right">Zal</Th>
                  <Th className="text-right">Abonement</Th>
                  <Th className="text-right">Jami</Th>
                </tr>
              </thead>
              <tbody>
                {daily.map((r, i) => (
                  <tr
                    key={r.date}
                    className={cn(
                      "border-b border-grid-line last:border-0 hover:bg-grid-row-hover",
                      r.date === today && "bg-brand-muted/40",
                      !onPage(i) && "hidden print:table-row",
                    )}
                  >
                    <Td className="nums text-left">{formatDateKey(r.date)}</Td>
                    <Td className="nums text-right text-muted-foreground">
                      {r.visitors || "-"}
                    </Td>
                    <Td className="nums text-right">
                      {r.products ? formatSom(r.products) : "-"}
                    </Td>
                    <Td className="nums text-right">
                      {r.floor ? formatSom(r.floor) : "-"}
                    </Td>
                    <Td className="nums text-right">
                      {r.subscriptions ? formatSom(r.subscriptions) : "-"}
                    </Td>
                    <Td className="nums text-right font-medium">
                      {r.total ? formatSom(r.total) : "-"}
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-grid-header font-medium">
                  <Td className="text-left">Jami</Td>
                  <Td className="nums text-right">{totals.visitors}</Td>
                  <Td className="nums text-right">{formatSom(totals.products)}</Td>
                  <Td className="nums text-right">{formatSom(totals.floor)}</Td>
                  <Td className="nums text-right">
                    {formatSom(totals.subscriptions)}
                  </Td>
                  <Td className="nums text-right font-semibold">
                    {formatSom(totals.total)}
                  </Td>
                </tr>
              </tfoot>
            </table>

            <Pagination {...dailyPaged} onPageChange={dailyPaged.setPage} />
          </Section>

          <p className="text-sm">
            <span className="text-muted-foreground">Yopilmagan qarz: </span>
            <span
              className={cn(
                "nums font-medium",
                outstanding > 0 && "text-status-debt-foreground",
              )}
            >
              {formatSom(outstanding)} so&apos;m
            </span>
          </p>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold tracking-tight">{title}</h3>
      <div className="overflow-x-auto border border-border">
        {children}
      </div>
    </section>
  );
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <tr className="border-b border-grid-line last:border-0">
      <Td className="text-left">{label}</Td>
      <Td
        className={cn(
          "nums w-32 text-right font-medium",
          tone === "warn" && "text-status-warning-foreground",
        )}
      >
        {value}
      </Td>
    </tr>
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
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "h-row border-r border-grid-line px-2 align-middle last:border-r-0",
        className,
      )}
    >
      {children}
    </td>
  );
}
