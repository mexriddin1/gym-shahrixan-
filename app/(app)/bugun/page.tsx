"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PrinterIcon } from "@phosphor-icons/react";

import {
  getDailySheet,
  getSettings,
  getWorkerAdvances,
  listAllSubscriptions,
  listPayments,
} from "@/lib/db/queries";
import {
  paymentMethodLabel,
  rowCollected,
  rowTotal,
  totalsByMethod,
  type PaymentMethodId,
} from "@/lib/db/types";
import { useResource } from "@/lib/db/use-resource";
import {
  cn,
  dateKey,
  formatDateKey,
  formatSom,
  timestampDay,
} from "@/lib/utils";
import { PageHeader } from "@/components/app/app-shell";
import { DayTabs } from "@/components/app/day-tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";

/**
 * One day, closed off.
 *
 * Hisobot answers "how did the last two weeks go" and opens on a range
 * picker. This answers the question asked at closing time - what is in the
 * till, and what happened to put it there - and it opens on today, because
 * that is the day being closed.
 *
 * It steps back a day at a time with the same strip the daily sheet uses,
 * rather than the range picker Hisobot has. That is the difference between
 * the two screens: a range is a question about a period, and a tab is
 * yesterday, which the desk checks when a number does not add up. Anything
 * wider is what Hisobot is for.
 *
 * The money is deliberately shown split by method before it is shown as a
 * total: the desk counts cash and checks Click on a phone, so a single number
 * is the one thing that cannot be reconciled against anything.
 */
export default function TodayPage() {
  const today = dateKey();
  const [date, setDate] = useState(() => today);

  const { data, loading, error, reload } = useResource(async () => {
    const [sheet, payments, subs, settings, advances] = await Promise.all([
      getDailySheet(date),
      listPayments(),
      listAllSubscriptions(),
      getSettings(),
      getWorkerAdvances(date),
    ]);
    return { sheet, payments, subs, settings, advances };
  }, [date]);

  const rows = useMemo(() => data?.sheet.rows ?? [], [data]);

  /** How this gym takes money, in the order set in Sozlamalar. */
  const methods = useMemo(
    () =>
      [...(data?.settings.paymentMethods ?? [])].sort(
        (a, b) => a.position - b.position,
      ),
    [data],
  );

  /** Subscriptions sold on the day being shown, newest first. */
  const sold = useMemo(() => {
    if (!data) return [];
    return data.subs.filter((s) => timestampDay(s.createdAt) === date);
  }, [data, date]);

  /** That day's money against a subscription, so a sale can name its method. */
  const paidBySubscription = useMemo(() => {
    const map = new Map<string, { amount: number; methods: Set<PaymentMethodId> }>();
    for (const p of data?.payments ?? []) {
      if (!p.subscriptionId || timestampDay(p.paidAt) !== date) continue;
      const cur = map.get(p.subscriptionId) ?? { amount: 0, methods: new Set() };
      cur.amount += p.amount;
      cur.methods.add(p.method);
      map.set(p.subscriptionId, cur);
    }
    return map;
  }, [data, date]);

  /**
   * Everything sold off the daily sheet that day, biggest earner first.
   *
   * Counted from the sheet's own lines rather than from stock movements: the
   * line is what the member was charged, and that is what this page is about.
   */
  const products = useMemo(() => {
    const map = new Map<string, { qty: number; total: number; unpaid: number }>();
    for (const row of rows) {
      for (const item of row.items) {
        const cur = map.get(item.productName) ?? { qty: 0, total: 0, unpaid: 0 };
        map.set(item.productName, {
          qty: cur.qty + item.qty,
          total: cur.total + item.lineTotal,
          unpaid: cur.unpaid + (item.paid ? 0 : item.lineTotal),
        });
      }
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  /**
   * What came in that day, per method, from both places money arrives.
   *
   * The daily sheet collects floor fees, products and the gym's own columns;
   * subscription money is a payment. Adding them per method rather than only
   * at the bottom is what makes the figure checkable against a till.
   *
   * A charge settled before the sheet recorded a method comes back under
   * `null` and is shown as "Belgilanmagan" rather than folded into cash -
   * saying the sheet does not know beats saying something plausible.
   */
  const byMethod = useMemo(() => {
    const totals = new Map<PaymentMethodId | null, number>(totalsByMethod(rows));
    for (const p of data?.payments ?? []) {
      if (timestampDay(p.paidAt) !== date) continue;
      totals.set(p.method, (totals.get(p.method) ?? 0) + p.amount);
    }

    const order = new Map(methods.map((m, i) => [m.id, i]));
    return [...totals]
      .filter(([, amount]) => amount !== 0)
      .sort(
        ([a], [b]) =>
          (order.get(a ?? "") ?? methods.length) -
          (order.get(b ?? "") ?? methods.length),
      )
      .map(([id, amount]) => ({
        id: id ?? "none",
        label: paymentMethodLabel(id, methods),
        amount,
      }));
  }, [rows, data, methods, date]);

  const takings = byMethod.reduce((s, m) => s + m.amount, 0);

  const advance = useMemo(
    () => [...(data?.advances.values() ?? [])].reduce((s, a) => s + a.amount, 0),
    [data],
  );

  /* What the sheet says was charged that day, settled or not. */
  const sheetCharged = rows.reduce((s, r) => s + rowTotal(r), 0);
  const sheetCollected = rows.reduce((s, r) => s + rowCollected(r), 0);
  const outstanding = Math.max(0, sheetCharged - sheetCollected);
  const gymFees = rows.reduce(
    (s, r) => s + (r.gymFeeMode === "cash" ? r.gymFee : 0),
    0,
  );
  const productTotal = products.reduce((s, p) => s + p.total, 0);
  const subscriptionTotal = sold.reduce((s, x) => s + x.finalPrice, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        // Named for the day it is showing rather than always "Bugungi", which
        // would be a lie on every tab but one.
        title={date === today ? "Bugungi hisobot" : "Kun hisoboti"}
        subtitle={formatDateKey(date)}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="print:hidden"
          >
            <PrinterIcon />
            Chop etish
          </Button>
        }
      />

      <DayTabs date={date} onChange={setDate} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {/* Pul */}
          <Section title="Pul">
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col />
                <col className="w-40" />
              </colgroup>
              <tbody>
                {byMethod.length === 0 ? (
                  <tr>
                    <Td colSpan={2} className="text-center text-muted-foreground">
                      Bu kuni pul olinmagan
                    </Td>
                  </tr>
                ) : (
                  byMethod.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-grid-line last:border-0"
                    >
                      <Td className="text-left">{m.label}</Td>
                      <Td className="nums text-right font-medium">
                        {formatSom(m.amount)}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-grid-header font-medium">
                  <Td className="text-left">Jami</Td>
                  <Td className="nums text-right font-semibold">
                    {formatSom(takings)}
                  </Td>
                </tr>
                {/* Money out. Only shown on a day it happened, so the report
                    does not carry a row of zeroes on every other day. */}
                {advance > 0 ? (
                  <>
                    <tr className="border-t border-grid-line">
                      <Td className="text-left text-muted-foreground">Avans</Td>
                      <Td className="nums text-right font-medium text-status-debt-foreground">
                        {formatSom(advance)}
                      </Td>
                    </tr>
                    <tr className="bg-grid-header font-medium">
                      <Td className="text-left">Sof</Td>
                      <Td className="nums text-right font-semibold">
                        {formatSom(takings - advance)}
                      </Td>
                    </tr>
                  </>
                ) : null}
              </tfoot>
            </table>
          </Section>

          {/* Bugungi abonementlar */}
          <Section title={`Abonementlar${sold.length ? ` (${sold.length})` : ""}`}>
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col />
                <col className="w-40" />
                <col className="w-44" />
                <col className="w-28" />
                <col className="w-32" />
              </colgroup>
              <thead>
                <tr className="bg-grid-header">
                  <Th className="text-left">Mijoz</Th>
                  <Th className="text-left">Tarif</Th>
                  <Th className="text-left">Muddat</Th>
                  <Th className="text-right">Summa</Th>
                  <Th className="text-right">To&apos;langan</Th>
                </tr>
              </thead>
              <tbody>
                {sold.length === 0 ? (
                  <tr>
                    <Td colSpan={5} className="text-center text-muted-foreground">
                      Bu kuni hech kim abonement olmadi
                    </Td>
                  </tr>
                ) : (
                  sold.map((s) => {
                    const paid = paidBySubscription.get(s.id);
                    const debt = s.finalPrice - (paid?.amount ?? 0);
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-grid-line last:border-0 hover:bg-grid-row-hover"
                      >
                        <Td className="text-left font-medium">
                          <Link
                            href={`/mijozlar/${s.clientId}`}
                            className="hover:underline"
                          >
                            {s.clientName}
                          </Link>
                        </Td>
                        <Td className="text-left text-muted-foreground">
                          {s.tariffName}
                        </Td>
                        <Td className="nums text-left text-muted-foreground">
                          {formatDateKey(s.startDate)}
                          {s.endDate ? (
                            <>
                              <span aria-hidden className="px-1 opacity-50">
                                –
                              </span>
                              {formatDateKey(s.endDate)}
                            </>
                          ) : null}
                        </Td>
                        <Td className="nums text-right font-medium">
                          {formatSom(s.finalPrice)}
                        </Td>
                        <Td className="nums text-right">
                          {paid ? (
                            <span className="flex items-baseline justify-end gap-1.5">
                              <span className="text-[0.7rem] text-muted-foreground">
                                {[...paid.methods]
                                  .map((m) => paymentMethodLabel(m, methods))
                                  .join(", ")}
                              </span>
                              <span className="font-medium">
                                {formatSom(paid.amount)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                          {/* Sold that day but not fully settled on it. The
                              desk needs this on the closing report, not a week
                              later off the debtors list. */}
                          {debt > 0 ? (
                            <span className="block text-[0.7rem] text-status-debt-foreground">
                              qarz {formatSom(debt)}
                            </span>
                          ) : null}
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {sold.length > 0 ? (
                <tfoot>
                  <tr className="border-t-2 border-border bg-grid-header font-medium">
                    <Td className="text-left" colSpan={3}>
                      Jami
                    </Td>
                    <Td className="nums text-right font-semibold">
                      {formatSom(subscriptionTotal)}
                    </Td>
                    <Td />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </Section>

          {/* Sotilgan mahsulotlar */}
          <Section title="Sotilgan mahsulotlar">
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col />
                <col className="w-24" />
                <col className="w-32" />
                <col className="w-32" />
              </colgroup>
              <thead>
                <tr className="bg-grid-header">
                  <Th className="text-left">Mahsulot</Th>
                  <Th className="text-right">Soni</Th>
                  <Th className="text-right">Summa</Th>
                  <Th className="text-right">Olinmagan</Th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <Td colSpan={4} className="text-center text-muted-foreground">
                      Bu kuni mahsulot sotilmagan
                    </Td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr
                      key={p.name}
                      className="border-b border-grid-line last:border-0"
                    >
                      <Td className="text-left">{p.name}</Td>
                      <Td className="nums text-right text-muted-foreground">
                        {p.qty}
                      </Td>
                      <Td className="nums text-right font-medium">
                        {formatSom(p.total)}
                      </Td>
                      <Td
                        className={cn(
                          "nums text-right",
                          p.unpaid > 0
                            ? "text-status-debt-foreground"
                            : "text-muted-foreground/50",
                        )}
                      >
                        {p.unpaid > 0 ? formatSom(p.unpaid) : "-"}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
              {products.length > 0 ? (
                <tfoot>
                  <tr className="border-t-2 border-border bg-grid-header font-medium">
                    <Td className="text-left">Jami</Td>
                    <Td className="nums text-right">
                      {products.reduce((s, p) => s + p.qty, 0)}
                    </Td>
                    <Td className="nums text-right font-semibold">
                      {formatSom(productTotal)}
                    </Td>
                    <Td className="nums text-right">
                      {formatSom(products.reduce((s, p) => s + p.unpaid, 0))}
                    </Td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </Section>

          {/* Kunlik varaqa */}
          <Section title="Kunlik varaqa">
            <table className="w-full table-fixed border-collapse text-xs">
              <tbody>
                <StatRow label="Kelganlar" value={rows.length} plain />
                <StatRow label="Zal to'lovi" value={gymFees} />
                <StatRow label="Mahsulot" value={productTotal} />
                <StatRow label="Varaqa bo'yicha jami" value={sheetCharged} />
                <StatRow
                  label="Shundan olinmagan"
                  value={outstanding}
                  tone={outstanding > 0 ? "debt" : undefined}
                />
              </tbody>
            </table>
          </Section>
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
      <div className="overflow-x-auto border border-border bg-card">
        {children}
      </div>
    </section>
  );
}

function StatRow({
  label,
  value,
  tone,
  plain,
}: {
  label: string;
  value: number;
  tone?: "debt";
  /** A count rather than money, so it is not formatted as so'm. */
  plain?: boolean;
}) {
  return (
    <tr className="border-b border-grid-line last:border-0">
      <Td className="text-left">{label}</Td>
      <Td
        className={cn(
          "nums w-40 text-right font-medium",
          tone === "debt" && "text-status-debt-foreground",
        )}
      >
        {plain ? value : formatSom(value)}
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
