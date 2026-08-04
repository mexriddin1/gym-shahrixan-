"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SpinnerIcon } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { recordPayment } from "@/lib/db/money-mutations";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/db/types";
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
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Default to settling the whole debt, which is what usually happens.
  const formKey = open ? (target?.id ?? "none") : null;
  const [prevKey, setPrevKey] = useState<string | null>(null);
  if (formKey !== prevKey) {
    setPrevKey(formKey);
    if (open && target) {
      setAmount(target.debt);
      setMethod("cash");
      setNote("");
      setError(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;

    if (amount <= 0) {
      setError("To'lov summasi 0 dan katta bo'lishi kerak");
      return;
    }
    if (amount > target.debt) {
      setError(`Qarzdan ko'p: eng ko'pi ${formatSom(target.debt)} so'm`);
      return;
    }

    setBusy(true);
    try {
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
      toast.success(`${formatSom(amount)} so'm qabul qilindi`);
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("To'lovni saqlab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  const remaining = target ? target.debt - amount : 0;

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
                  {formatSom(target.debt)}
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
              {[target.debt, 50_000, 100_000, 200_000]
                .filter((v, i, arr) => v <= target.debt && arr.indexOf(v) === i)
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
                ) : (
                  "Qabul qilish"
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
