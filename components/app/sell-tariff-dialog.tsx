"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SpinnerIcon, TagIcon } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { sellTariff } from "@/lib/db/money-mutations";
import {
  PAYMENT_METHOD_LABELS,
  type Client,
  type PaymentMethod,
  type Tariff,
} from "@/lib/db/types";
import { computeFinalPrice } from "@/lib/domain/pricing";
import { computeEndDate } from "@/lib/domain/subscription";
import { cn, dateKey, formatDateKey, formatSom } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";

/**
 * Sells a tariff to a member.
 *
 * Deliberately short: the member is already known from the page it opens on,
 * tariffs are picked as cards rather than hunted for in a dropdown, and a
 * discount is just an amount. The previous version asked for a client, a
 * discount *type*, and a reason, which is three questions to sell a day pass.
 */
export function SellTariffDialog({
  open,
  onOpenChange,
  client,
  tariffs,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  tariffs: Tariff[];
  onSaved: () => void;
}) {
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;

  const [tariffId, setTariffId] = useState("");
  const [startDate, setStartDate] = useState(() => dateKey());
  const [discount, setDiscount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);

  const available = useMemo(
    () => tariffs.filter((t) => t.status === "active"),
    [tariffs],
  );

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTariffId("");
      setStartDate(dateKey());
      setDiscount(0);
      setPaidAmount(0);
      setMethod("cash");
    }
  }

  const tariff = available.find((t) => t.id === tariffId) ?? null;
  const originalPrice = tariff?.price ?? 0;
  const finalPrice = tariff ? computeFinalPrice(originalPrice, "amount", discount) : 0;
  const endDate = tariff ? computeEndDate(startDate, tariff.durationDays) : null;
  const debt = Math.max(0, finalPrice - paidAmount);

  /** Picking a tariff assumes payment in full; the cashier can override. */
  function pick(next: Tariff) {
    setTariffId(next.id);
    setPaidAmount(computeFinalPrice(next.price, "amount", discount));
  }

  function changeDiscount(value: number) {
    setDiscount(value);
    if (tariff) setPaidAmount(computeFinalPrice(tariff.price, "amount", value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tariff) return;

    setBusy(true);
    try {
      await sellTariff(
        {
          client,
          tariff,
          startDate,
          discountType: discount > 0 ? "amount" : "none",
          discountValue: discount,
          discountReason: null,
          endDate: null,
          endDateReason: null,
          paidAmount,
          method,
          note: null,
        },
        actor,
      );
      toast.success("Abonement sotildi");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Saqlab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tarif sotish</DialogTitle>
          <DialogDescription>
            {`${client.firstName} ${client.lastName ?? ""}`.trim()}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {available.length === 0 ? (
            <EmptyState
              icon={TagIcon}
              title="Tarif yo'q"
              description="Sozlamalar bo'limida kamida bitta tarif qo'shing."
              className="py-8"
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {available.map((t) => {
                const selected = t.id === tariffId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pick(t)}
                    aria-pressed={selected}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left",
                      "transition-colors outline-none active:scale-[0.99]",
                      selected
                        ? "border-brand bg-brand-muted"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <span className="text-sm font-medium">{t.name}</span>
                    <span className="nums text-base font-semibold tracking-tight">
                      {formatSom(t.price)}
                    </span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      {(t.durationDays ?? 0) > 1
                        ? `${t.durationDays} kun`
                        : "Kunlik"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {tariff ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Boshlanish" htmlFor="startDate" required>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="nums"
                  />
                </Field>

                <Field
                  label="Tugash"
                  htmlFor="endDatePreview"
                  helper="Tarif muddatidan hisoblanadi"
                >
                  <Input
                    id="endDatePreview"
                    readOnly
                    value={endDate ? formatDateKey(endDate) : "-"}
                    className="nums bg-muted/50"
                  />
                </Field>

                <Field
                  label="Chegirma"
                  htmlFor="discount"
                  helper={discount > 0 ? `${formatSom(discount)} so'm` : "Ixtiyoriy"}
                >
                  <Input
                    id="discount"
                    inputMode="numeric"
                    value={discount || ""}
                    onChange={(e) => changeDiscount(Number(e.target.value) || 0)}
                    className="nums"
                  />
                </Field>

                <Field label="To'landi" htmlFor="paidAmount">
                  <Input
                    id="paidAmount"
                    inputMode="numeric"
                    value={paidAmount || ""}
                    onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                    className="nums"
                  />
                </Field>
              </div>

              <Field label="To'lov turi" htmlFor="method">
                <Select
                  id="method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>

              {/* Live money summary so the desk sees the outcome before committing. */}
              <dl className="grid grid-cols-3 gap-px overflow-hidden border border-border bg-grid-line">
                <Summary label="Asl narx" value={formatSom(originalPrice)} />
                <Summary label="Yakuniy" value={formatSom(finalPrice)} strong />
                <Summary
                  label="Qarz"
                  value={formatSom(debt)}
                  tone={debt > 0 ? "debt" : undefined}
                />
              </dl>
            </>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Bekor qilish
            </Button>
            <Button type="submit" disabled={busy || !tariff}>
              {busy ? (
                <>
                  <SpinnerIcon className="animate-spin" />
                  Saqlanmoqda
                </>
              ) : (
                "Sotish"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Summary({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "debt";
}) {
  return (
    <div className="bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "nums mt-0.5 text-sm",
          strong && "font-semibold",
          tone === "debt" && "text-status-debt-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
