"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SpinnerIcon, TagIcon } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import {
  changeSubscriptionTariff,
  recordPayment,
} from "@/lib/db/money-mutations";
import type {
  PaymentMethod,
  PaymentMethodId,
  Subscription,
  Tariff,
} from "@/lib/db/types";
import { computeDebt } from "@/lib/domain/pricing";
import { computeEndDate } from "@/lib/domain/subscription";
import { cn, formatDateKey, formatSom } from "@/lib/utils";
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
 * Moves a sale onto another tariff.
 *
 * The case this exists for: a member buys the ordinary tariff, comes back a
 * few days later and wants VIP. The sale is re-priced in place and whatever
 * they have not paid yet stays on them as debt. If they hand the difference
 * over right there, it can be taken in the same step; either way the payment
 * is dated today, so it counts in today's takings.
 */
export function ChangeTariffDialog({
  open,
  onOpenChange,
  subscription,
  paid,
  tariffs,
  methods,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: Subscription | null;
  /** Already paid against this sale. */
  paid: number;
  tariffs: Tariff[];
  /** What this gym takes, from Sozlamalar. */
  methods: PaymentMethod[];
  onSaved: () => void;
}) {
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;

  const [tariffId, setTariffId] = useState("");
  const [payNow, setPayNow] = useState(0);
  const [method, setMethod] = useState<PaymentMethodId>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const available = useMemo(
    () =>
      tariffs.filter(
        (t) => t.status === "active" && t.id !== subscription?.tariffId,
      ),
    [tariffs, subscription?.tariffId],
  );

  const ordered = useMemo(
    () => [...methods].sort((a, b) => a.position - b.position),
    [methods],
  );
  const defaultMethod = ordered[0]?.id ?? "";

  const formKey = open ? (subscription?.id ?? "none") : null;
  const [prevKey, setPrevKey] = useState<string | null>(null);
  if (formKey !== prevKey) {
    setPrevKey(formKey);
    if (open) {
      setTariffId("");
      setPayNow(0);
      setMethod(defaultMethod);
      setError(null);
    }
  }

  if (!subscription) return null;
  const sub = subscription;

  const tariff = available.find((t) => t.id === tariffId) ?? null;
  const newPrice = tariff?.price ?? 0;
  const debt = tariff ? computeDebt(newPrice, paid) : 0;
  // Moving down to a cheaper tariff than what was already paid means money
  // goes back across the desk. Say so rather than show a debt of zero.
  const refund = tariff ? Math.max(0, paid - newPrice) : 0;
  const endDate = tariff
    ? sub.endDateManual
      ? sub.endDate
      : computeEndDate(sub.startDate, tariff.durationDays)
    : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tariff) return;

    if (payNow < 0) {
      setError("To'lov summasi manfiy bo'lishi mumkin emas");
      return;
    }
    if (payNow > debt) {
      setError(`Qarzdan ko'p: eng ko'pi ${formatSom(debt)} so'm`);
      return;
    }

    setBusy(true);
    // Not one transaction: if the payment fails after the tariff has moved,
    // the screen still needs a reload to show the new terms.
    let changed = false;
    try {
      await changeSubscriptionTariff(sub.id, sub, tariff, actor);
      changed = true;

      if (payNow > 0) {
        await recordPayment(
          {
            clientId: sub.clientId,
            clientName: sub.clientName,
            subscriptionId: sub.id,
            orderId: null,
            amount: payNow,
            method: method || defaultMethod,
            note: `Tarif almashtirildi: ${sub.tariffName} -> ${tariff.name}`,
          },
          actor,
        );
      }

      const left = debt - payNow;
      toast.success(
        left > 0
          ? `Tarif almashtirildi, qarz ${formatSom(left)} so'm`
          : "Tarif almashtirildi",
      );
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error(
        changed
          ? "Tarif almashtirildi, lekin to'lovni saqlab bo'lmadi"
          : "Tarifni almashtirib bo'lmadi",
      );
      if (changed) onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tarifni almashtirish</DialogTitle>
          <DialogDescription>
            {`${sub.clientName} · hozir ${sub.tariffName} · #${sub.code}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {available.length === 0 ? (
            <EmptyState
              icon={TagIcon}
              title="Boshqa tarif yo'q"
              description="Sozlamalar bo'limida yana bitta tarif qo'shing."
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
                    onClick={() => {
                      setTariffId(t.id);
                      setPayNow(0);
                      setError(null);
                    }}
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
              <p className="nums text-xs text-muted-foreground">
                {formatDateKey(sub.startDate)}
                {endDate ? ` - ${formatDateKey(endDate)}` : ""}
              </p>

              <dl className="grid grid-cols-3 gap-px overflow-hidden border border-border bg-grid-line">
                <Cell label="Yangi narx" value={formatSom(newPrice)} strong />
                <Cell label="To'langan" value={formatSom(paid)} />
                {refund > 0 ? (
                  <Cell label="Qaytariladi" value={formatSom(refund)} tone="debt" />
                ) : (
                  <Cell
                    label="Qarz"
                    value={formatSom(debt - payNow)}
                    tone={debt - payNow > 0 ? "debt" : undefined}
                  />
                )}
              </dl>

              {debt > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Hozir to'lanadi"
                    htmlFor="changePayNow"
                    error={error}
                    helper="Bo'sh qolsa, farq qarz bo'lib yoziladi"
                  >
                    <Input
                      id="changePayNow"
                      inputMode="numeric"
                      value={payNow || ""}
                      onChange={(e) => {
                        setPayNow(Number(e.target.value) || 0);
                        setError(null);
                      }}
                      aria-invalid={!!error}
                      className="nums"
                    />
                  </Field>

                  <Field label="To'lov turi" htmlFor="changeMethod">
                    <Select
                      id="changeMethod"
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                    >
                      {ordered.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : null}
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
                "Almashtirish"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Cell({
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
