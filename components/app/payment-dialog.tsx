"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SpinnerIcon } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { recordPayment, updateSubscription } from "@/lib/db/money-mutations";
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type Subscription,
} from "@/lib/db/types";
import { computeDebt, computeFinalPrice } from "@/lib/domain/pricing";
import { formatSom } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export type PaymentTarget = {
  kind: "subscription" | "order";
  id: string;
  clientId: string | null;
  clientName: string;
  label: string;
  debt: number;
  /**
   * The sale behind this debt, when the desk is allowed to re-price it while
   * taking the money.
   *
   * A discount usually gets agreed at the moment of paying, not before it, and
   * without this the staff had to close the dialog, edit the sale, and open it
   * again. Leave it off and the amount owed is fixed.
   */
  subscription?: Subscription;
  /** Paid against it so far. Only meaningful alongside `subscription`. */
  paid?: number;
};

/** Takes a payment against an outstanding subscription or order. */
export function PaymentDialog({
  open,
  onOpenChange,
  target,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PaymentTarget | null;
  onSaved: () => void;
}) {
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;

  const [amount, setAmount] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sub = target?.subscription ?? null;
  const paid = target?.paid ?? 0;
  /** What was already off the price when the dialog opened. */
  const startingDiscount = sub ? Math.max(0, sub.originalPrice - sub.finalPrice) : 0;

  // Default to settling the whole debt, which is what usually happens.
  const formKey = open ? (target?.id ?? "none") : null;
  const [prevKey, setPrevKey] = useState<string | null>(null);
  if (formKey !== prevKey) {
    setPrevKey(formKey);
    if (open && target) {
      setAmount(target.debt);
      setDiscount(startingDiscount);
      setMethod("cash");
      setNote("");
      setError(null);
    }
  }

  // Everything below is recomputed from the discount in the box, so the desk
  // watches the debt fall as it types rather than after saving.
  const finalPrice = sub
    ? computeFinalPrice(sub.originalPrice, discount > 0 ? "amount" : "none", discount)
    : 0;
  const debt = sub ? computeDebt(finalPrice, paid) : (target?.debt ?? 0);
  const discountChanged = !!sub && discount !== startingDiscount;

  /** Cutting the price cuts what is being handed over with it. */
  function changeDiscount(value: number) {
    setDiscount(value);
    setError(null);
    if (!sub) return;
    const next = computeFinalPrice(
      sub.originalPrice,
      value > 0 ? "amount" : "none",
      value,
    );
    setAmount(computeDebt(next, paid));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;

    if (amount < 0) {
      setError("To'lov summasi manfiy bo'lishi mumkin emas");
      return;
    }
    // Zero is only allowed when the discount is what the desk came here to do,
    // typically one that clears the debt outright.
    if (amount === 0 && !discountChanged) {
      setError("To'lov summasi 0 dan katta bo'lishi kerak");
      return;
    }
    if (amount > debt) {
      setError(`Qarzdan ko'p: eng ko'pi ${formatSom(debt)} so'm`);
      return;
    }
    if (sub && discount > sub.originalPrice) {
      setError(`Chegirma narxdan ko'p: eng ko'pi ${formatSom(sub.originalPrice)} so'm`);
      return;
    }

    setBusy(true);
    // The two writes are not one transaction, so if the payment fails after
    // the price has already moved, the screen still has to be told: the
    // discount is real and the caller's copy of the sale is now stale.
    let repriced = false;
    try {
      // Price first: the payment has to be taken against the amount the member
      // actually agreed to, and a failure here must not leave money recorded
      // against the old one.
      if (sub && discountChanged) {
        await updateSubscription(
          sub.id,
          sub,
          {
            startDate: sub.startDate,
            endDate: sub.endDate,
            discountValue: discount,
            discountReason: sub.discountReason,
            note: sub.note,
          },
          actor,
        );
        repriced = true;
      }

      if (amount > 0) {
        await recordPayment(
          {
            clientId: target.clientId,
            clientName: target.clientName,
            subscriptionId: target.kind === "subscription" ? target.id : null,
            orderId: target.kind === "order" ? target.id : null,
            amount,
            method,
            note: note.trim() || null,
          },
          actor,
        );
      }

      toast.success(
        amount > 0
          ? `${formatSom(amount)} so'm qabul qilindi`
          : "Chegirma saqlandi",
      );
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error(
        repriced
          ? "Chegirma saqlandi, lekin to'lovni saqlab bo'lmadi"
          : "To'lovni saqlab bo'lmadi",
      );
      if (repriced) onSaved();
    } finally {
      setBusy(false);
    }
  }

  const remaining = debt - amount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>To&apos;lov qabul qilish</DialogTitle>
          <DialogDescription>
            {target ? `${target.clientName} · ${target.label}` : ""}
          </DialogDescription>
        </DialogHeader>

        {target ? (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <dl className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-grid-line">
              <div className="bg-card px-3 py-2">
                <dt className="text-xs text-muted-foreground">Qarz</dt>
                <dd className="nums mt-0.5 text-sm font-medium">
                  {formatSom(debt)}
                  {/* The old figure stays visible while a discount is being
                      typed, so the desk can see what it just took off. */}
                  {debt !== target.debt ? (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">
                      {formatSom(target.debt)}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="bg-card px-3 py-2">
                <dt className="text-xs text-muted-foreground">
                  To&apos;lovdan keyin
                </dt>
                <dd className="nums mt-0.5 text-sm font-medium">
                  {formatSom(Math.max(0, remaining))}
                </dd>
              </div>
            </dl>

            {sub ? (
              <Field
                label="Chegirma"
                htmlFor="payDiscount"
                helper={`Asl narx ${formatSom(sub.originalPrice)} so'm · yakuniy ${formatSom(finalPrice)} so'm`}
              >
                <Input
                  id="payDiscount"
                  inputMode="numeric"
                  value={discount || ""}
                  onChange={(e) => changeDiscount(Number(e.target.value) || 0)}
                  className="nums"
                />
              </Field>
            ) : null}

            <Field label="Summa" htmlFor="amount" error={error} required>
              <Input
                id="amount"
                autoFocus
                inputMode="numeric"
                value={amount || ""}
                onChange={(e) => {
                  setAmount(Number(e.target.value) || 0);
                  setError(null);
                }}
                aria-invalid={!!error}
                className="nums"
              />
            </Field>

            <div className="flex flex-wrap gap-1.5">
              {[debt, 50_000, 100_000, 200_000]
                .filter((v, i, arr) => v > 0 && v <= debt && arr.indexOf(v) === i)
                .map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setAmount(preset);
                      setError(null);
                    }}
                  >
                    <span className="nums">{formatSom(preset)}</span>
                  </Button>
                ))}
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

            <Field label="Izoh" htmlFor="note">
              <Textarea
                id="note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Bekor qilish
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <SpinnerIcon className="animate-spin" />
                    Saqlanmoqda
                  </>
                ) : amount > 0 ? (
                  "Qabul qilish"
                ) : (
                  // A discount that clears the debt outright leaves nothing to
                  // take, and the button should not claim otherwise.
                  "Chegirmani saqlash"
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
