"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CheckCircleIcon,
  CreditCardIcon,
  MagnifyingGlassIcon,
  ReceiptIcon,
} from "@phosphor-icons/react";

import {
  getSettings,
  listAllSubscriptions,
  listDebtors,
  listPayments,
  type Debtor,
} from "@/lib/db/queries";
import { PAYMENT_METHOD_LABELS, type Payment, type Subscription } from "@/lib/db/types";
import { useResource } from "@/lib/db/use-resource";
import { paidBySubscription } from "@/lib/db/money-mutations";
import { subscriptionReceipt, type Receipt } from "@/lib/domain/receipt";
import {
  cn,
  dateKey,
  formatDateKey,
  formatDateTime,
  formatSom,
  timestampDay,
} from "@/lib/utils";
import { PageHeader } from "@/components/app/app-shell";
import { DataTable } from "@/components/grid/data-table";
import { PaymentDialog, type PaymentTarget } from "@/components/app/payment-dialog";
import { ReceiptDialog } from "@/components/app/receipt-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";

type Tab = "debts" | "payments";

/**
 * Money in one place: who still owes, and what has been taken.
 *
 * Debtors lead because that is the list someone acts on; payments are the
 * record you consult afterwards.
 */
export default function MonthlyPage() {
  const [tab, setTab] = useState<Tab>("payments");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [range, setRange] = useState("month");
  const [target, setTarget] = useState<PaymentTarget | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const { data, loading, error, reload } = useResource(async () => {
    const [debtors, payments, subs, settings] = await Promise.all([
      listDebtors(),
      listPayments(),
      listAllSubscriptions(),
      getSettings(),
    ]);
    return { debtors, payments, subs, settings };
  }, []);

  const q = search.trim().toLowerCase();

  const debtors = useMemo(() => {
    if (!data) return [];
    return data.debtors.filter(
      (d) => !q || d.clientName.toLowerCase().includes(q) || String(d.code).includes(q),
    );
  }, [data, q]);

  const payments = useMemo(() => {
    if (!data) return [];
    const today = dateKey();
    return data.payments.filter((p) => {
      if (method && p.method !== method) return false;
      if (range !== "all") {
        const day = timestampDay(p.paidAt) ?? "";
        if (range === "today" && day !== today) return false;
        if (range === "month" && day.slice(0, 7) !== today.slice(0, 7)) return false;
      }
      if (!q) return true;
      return (
        (p.clientName ?? "").toLowerCase().includes(q) || String(p.code).includes(q)
      );
    });
  }, [data, q, method, range]);

  const totalDebt = debtors.reduce((sum, d) => sum + d.debt, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  /** Builds the receipt for whichever subscription a row points at. */
  function openReceipt(subscriptionId: string | null) {
    if (!data || !subscriptionId) return;
    const sub = data.subs.find((s: Subscription) => s.id === subscriptionId);
    if (!sub) return;
    const paid = paidBySubscription(data.payments).get(sub.id) ?? 0;
    setReceipt(subscriptionReceipt(sub, paid));
  }

  const debtColumns = useMemo<ColumnDef<Debtor, unknown>[]>(
    () => [
      {
        accessorKey: "clientName",
        header: "Mijoz",
        cell: ({ row }) =>
          row.original.clientId ? (
            <Link
              href={`/mijozlar/${row.original.clientId}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium hover:underline"
            >
              {row.original.clientName}
            </Link>
          ) : (
            <span className="font-medium">{row.original.clientName}</span>
          ),
      },
      {
        accessorKey: "label",
        header: "Tarif",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.label}</span>
        ),
      },
      {
        accessorKey: "date",
        header: "Sana",
        cell: ({ row }) => (
          <span className="nums text-muted-foreground">
            {row.original.date ? formatDateKey(row.original.date) : "-"}
          </span>
        ),
      },
      {
        accessorKey: "finalPrice",
        header: "Summa",
        cell: ({ row }) => (
          <span className="nums text-muted-foreground">
            {formatSom(row.original.finalPrice)}
          </span>
        ),
      },
      {
        accessorKey: "paid",
        header: "To'langan",
        cell: ({ row }) => (
          <span className="nums text-muted-foreground">
            {formatSom(row.original.paid)}
          </span>
        ),
      },
      {
        accessorKey: "debt",
        header: "Qarz",
        cell: ({ row }) => (
          <span className="nums font-medium text-status-debt-foreground">
            {formatSom(row.original.debt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Chek"
              onClick={(e) => {
                e.stopPropagation();
                openReceipt(row.original.id);
              }}
            >
              <ReceiptIcon />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setTarget({
                  kind: row.original.kind,
                  id: row.original.id,
                  clientId: row.original.clientId,
                  clientName: row.original.clientName,
                  label: row.original.label,
                  debt: row.original.debt,
                  // Carries the sale itself so the debt can be discounted here
                  // rather than only on the member's page.
                  subscription: data?.subs.find(
                    (s: Subscription) => s.id === row.original.id,
                  ),
                  paid: row.original.paid,
                });
                setPayOpen(true);
              }}
            >
              To&apos;lash
            </Button>
          </div>
        ),
      },
    ],
    // openReceipt closes over `data`, which is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  const paymentColumns = useMemo<ColumnDef<Payment, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        header: "ID",
        cell: ({ row }) => (
          <span className="nums text-muted-foreground">#{row.original.code}</span>
        ),
      },
      {
        id: "paidAt",
        header: "Sana",
        accessorFn: (p) => p.paidAt?.toMillis?.() ?? 0,
        cell: ({ row }) => (
          <span className="nums text-muted-foreground">
            {row.original.paidAt ? formatDateTime(row.original.paidAt.toDate()) : "-"}
          </span>
        ),
      },
      {
        accessorKey: "clientName",
        header: "Mijoz",
        cell: ({ row }) =>
          row.original.clientId ? (
            <Link
              href={`/mijozlar/${row.original.clientId}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium hover:underline"
            >
              {row.original.clientName ?? "Mehmon"}
            </Link>
          ) : (
            <span className="text-muted-foreground">Mehmon</span>
          ),
      },
      {
        accessorKey: "method",
        header: "Turi",
        cell: ({ row }) => (
          <Badge variant="neutral">
            {PAYMENT_METHOD_LABELS[row.original.method]}
          </Badge>
        ),
      },
      {
        accessorKey: "amount",
        header: "Summa",
        cell: ({ row }) => (
          <span className="nums font-medium">{formatSom(row.original.amount)}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.subscriptionId ? (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Chek"
                onClick={(e) => {
                  e.stopPropagation();
                  openReceipt(row.original.subscriptionId);
                }}
              >
                <ReceiptIcon />
              </Button>
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Oylik"
        subtitle={
          data
            ? `${formatSom(totalDebt)} so'm qarz · ${formatSom(totalPaid)} so'm qabul qilingan`
            : undefined
        }
      />

      {/* Two views of the same money, so tabs rather than two screens. */}
      <div
        role="tablist"
        aria-label="Oylik bo'limlari"
        className="flex gap-1 border-b border-border"
      >
        {(
          [
            ["payments", "To'lovlar", data?.payments.length ?? 0],
            ["debts", "Qarzdorliklar", data?.debtors.length ?? 0],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors outline-none",
              tab === value
                ? "border-brand font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <span className="nums text-xs text-muted-foreground">{count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mijoz ismi yoki ID"
            aria-label="Qidirish"
            className="pl-8"
          />
        </div>

        {tab === "payments" ? (
          <>
            <Select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              aria-label="Davr"
              className="w-32"
            >
              <option value="today">Bugun</option>
              <option value="month">Shu oy</option>
              <option value="all">Butun davr</option>
            </Select>
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              aria-label="To'lov turi"
              className="w-32"
            >
              <option value="">Barcha turlar</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </>
        ) : null}
      </div>

      {tab === "debts" ? (
        <DataTable
          columns={debtColumns}
          data={debtors}
          loading={loading}
          error={error}
          onRetry={reload}
          rowClassName={() => "border-l-2 border-l-status-debt-edge"}
          empty={
            <EmptyState
              icon={q ? MagnifyingGlassIcon : CheckCircleIcon}
              title={q ? "Qarzdor topilmadi" : "Qarzdorlik yo'q"}
              description={
                q
                  ? "Boshqa ism bilan qidirib ko'ring."
                  : "Barcha abonementlar to'liq to'langan."
              }
            />
          }
        />
      ) : (
        <DataTable
          columns={paymentColumns}
          data={payments}
          loading={loading}
          error={error}
          onRetry={reload}
          empty={
            <EmptyState
              icon={CreditCardIcon}
              title="To'lov topilmadi"
              description="Bu davrda to'lov qabul qilinmagan. Filtrni o'zgartirib ko'ring."
            />
          }
        />
      )}

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        target={target}
        onSaved={reload}
      />

      {data ? (
        <ReceiptDialog
          open={receipt !== null}
          onOpenChange={(open) => !open && setReceipt(null)}
          receipt={receipt}
          settings={data.settings}
        />
      ) : null}
    </div>
  );
}
