"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SpinnerIcon } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { updateSubscription } from "@/lib/db/money-mutations";
import type { Subscription } from "@/lib/db/types";
import { computeDebt, computeFinalPrice } from "@/lib/domain/pricing";
import { computeEndDate } from "@/lib/domain/subscription";
import { cn, formatSom } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

/** What is currently taken off this sale, as an absolute amount. */
function currentDiscount(sub: Subscription): number {
  return Math.max(0, sub.originalPrice - sub.finalPrice);
}

/**
 * Re-opens a sale that has already been rung up.
 *
 * The case this exists for: a member is handed their chek, then asks about the
 * discount they were promised. Before this the only way through was to delete
 * the sale and enter it again, which threw away its code, its date and the
 * payments already taken against it. Here the terms change and everything
 * hanging off the sale stays put.
 */
export function EditSubscriptionDialog({
  open,
  onOpenChange,
  subscription,
  paid,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: Subscription | null;
  /** Already paid against this sale. Decides whether a cut means a refund. */
  paid: number;
  onSaved: () => void;
}) {
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [discount, setDiscount] = useState(0);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reload the form whenever a different sale is opened, not on every render.
  const formKey = open ? (subscription?.id ?? "none") : null;
  const [prevKey, setPrevKey] = useState<string | null>(null);
  if (formKey !== prevKey) {
    setPrevKey(formKey);
    if (open && subscription) {
      setStartDate(subscription.startDate);
      setEndDate(subscription.endDate ?? "");
      setDiscount(currentDiscount(subscription));
      setReason(subscription.discountReason ?? "");
      setNote(subscription.note ?? "");
      setError(null);
    }
  }

  if (!subscription) return null;

  const sub = subscription;
  const finalPrice = computeFinalPrice(
    sub.originalPrice,
    discount > 0 ? "amount" : "none",
    discount,
  );
  const debt = computeDebt(finalPrice, paid);
  // A discount deeper than what has already been handed over is not a debt of
  // zero, it is money going back across the desk. Say so rather than hide it.
  const refund = Math.max(0, paid - finalPrice);

  /**
   * Moving the start date drags an auto end date along with it. One that was
   * typed by hand is left alone: it was set to a specific day for a reason.
   */
  function changeStart(next: string) {
    const auto = computeEndDate(startDate, sub.durationDays);
    setStartDate(next);
    if (!endDate || endDate === auto) {
      setEndDate(computeEndDate(next, sub.durationDays) ?? "");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!startDate) {
      setError("Boshlanish sanasi majburiy");
      return;
    }
    if (endDate && endDate < startDate) {
      setError("Tugash sanasi boshlanishdan oldin bo'lishi mumkin emas");
      return;
    }
    if (discount > sub.originalPrice) {
      setError(`Chegirma narxdan ko'p: eng ko'pi ${formatSom(sub.originalPrice)} so'm`);
      return;
    }

    setBusy(true);
    try {
      await updateSubscription(
        sub.id,
        sub,
        {
          startDate,
          endDate: endDate || null,
          discountValue: discount,
          discountReason: reason.trim() || null,
          note: note.trim() || null,
        },
        actor,
      );
      toast.success("Abonement yangilandi");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Saqlab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Abonementni tahrirlash</DialogTitle>
          <DialogDescription>
            {`${sub.clientName} · ${sub.tariffName} · #${sub.code}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Boshlanish" htmlFor="editStart" required>
              <Input
                id="editStart"
                type="date"
                value={startDate}
                onChange={(e) => {
                  changeStart(e.target.value);
                  setError(null);
                }}
                className="nums"
              />
            </Field>

            <Field
              label="Tugash"
              htmlFor="editEnd"
              helper={
                sub.durationDays ? `Tarif muddati ${sub.durationDays} kun` : "Muddatsiz"
              }
            >
              <Input
                id="editEnd"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setError(null);
                }}
                className="nums"
              />
            </Field>

            <Field
              label="Chegirma"
              htmlFor="editDiscount"
              helper={`Asl narx ${formatSom(sub.originalPrice)} so'm`}
            >
              <Input
                id="editDiscount"
                inputMode="numeric"
                value={discount || ""}
                onChange={(e) => {
                  setDiscount(Number(e.target.value) || 0);
                  setError(null);
                }}
                className="nums"
              />
            </Field>

            <Field label="Chegirma sababi" htmlFor="editReason">
              <Input
                id="editReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ixtiyoriy"
              />
            </Field>
          </div>

          <Field label="Izoh" htmlFor="editNote">
            <Textarea
              id="editNote"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          {/* Same three-tile summary as the sale itself, so an edit reads as
              the same operation seen twice rather than a different screen. */}
          <dl className="grid grid-cols-3 gap-px overflow-hidden border border-border bg-grid-line">
            <Cell label="Yakuniy" value={formatSom(finalPrice)} strong />
            <Cell label="To'langan" value={formatSom(paid)} />
            {refund > 0 ? (
              <Cell label="Qaytariladi" value={formatSom(refund)} tone="debt" />
            ) : (
              <Cell
                label="Qarz"
                value={formatSom(debt)}
                tone={debt > 0 ? "debt" : undefined}
              />
            )}
          </dl>

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
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
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <SpinnerIcon className="animate-spin" />
                  Saqlanmoqda
                </>
              ) : (
                "Saqlash"
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
