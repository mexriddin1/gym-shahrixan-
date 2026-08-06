"use client";

import { useState, type FormEvent } from "react";
import { SpinnerIcon } from "@phosphor-icons/react";

import { formatSom } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Charges a monthly member for a single day.
 *
 * The monthly rate is an agreement to come every other day, three times a
 * week. A fourth visit is paid for like a walk-in — so the sheet's "oylik"
 * cell has to be able to become an amount, without touching the subscription
 * sitting behind it.
 *
 * Two steps on purpose. The first is the decision, made about a member
 * standing at the desk, and it is a yes or a no. The second is the price,
 * which is already known and usually just needs an Enter. Putting the input on
 * screen straight away would turn the question into a form and invite someone
 * to type a number before deciding whether to charge at all.
 */
export function DailyChargeDialog({
  open,
  onOpenChange,
  clientName,
  baseFee,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  /** The gym's day rate. Offered as a starting point, not imposed. */
  baseFee: number;
  onConfirm: (amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [asked, setAsked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset during render rather than in an effect: reopening for the next
  // member would otherwise show the previous one's answer for a frame.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAsked(false);
      setAmount(baseFee > 0 ? String(baseFee) : "");
      setError(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const parsed = Number(amount.replace(/\s/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Summa 0 dan katta bo'lishi kerak");
      return;
    }

    setBusy(true);
    try {
      await onConfirm(Math.round(parsed));
      onOpenChange(false);
    } catch {
      // The caller raises its own toast. The dialog stays open so the amount
      // does not have to be typed again.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {asked
              ? "Bugungi to'lov"
              : `${clientName} faqat bugun uchun kunlik to'laydimi?`}
          </DialogTitle>
          <DialogDescription>
            {asked
              ? "Bosh narx qo'yildi. Kerak bo'lsa o'zgartiring."
              : `Oylik obunasi o'zgarmaydi — faqat bugungi satrga to'lov yoziladi. Bosh narx: ${formatSom(baseFee)}.`}
          </DialogDescription>
        </DialogHeader>

        {asked ? (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field label="Summa" htmlFor="dailyCharge" error={error} required>
              <Input
                id="dailyCharge"
                autoFocus
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^\d\s]/g, ""));
                  setError(null);
                }}
                // Selected on focus so the offered price is one keystroke away
                // from being replaced, the way a spreadsheet cell behaves.
                onFocus={(e) => e.currentTarget.select()}
                aria-invalid={!!error}
                className="nums text-right"
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
                ) : (
                  "Saqlash"
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Yo&apos;q
            </Button>
            <Button type="button" autoFocus onClick={() => setAsked(true)}>
              Ha
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
