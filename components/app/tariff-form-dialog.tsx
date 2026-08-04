"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SpinnerIcon } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { createTariff, updateTariff, type TariffInput } from "@/lib/db/mutations";
import type { Tariff } from "@/lib/db/types";
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
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

/**
 * A tariff is a name, a price, and how long it lasts.
 *
 * Visit counts and weekday restrictions were removed: the gym sells day passes
 * and month passes, and every extra field was one more thing to fill in for a
 * distinction nobody was making.
 */
const EMPTY: TariffInput = {
  name: "",
  description: null,
  price: 0,
  durationDays: 30,
  visitLimit: null,
  weeklyLimit: null,
  allowedWeekdays: null,
  isVip: false,
  color: null,
  status: "active",
};

function toInput(t: Tariff): TariffInput {
  return {
    name: t.name,
    description: t.description,
    price: t.price,
    durationDays: t.durationDays,
    visitLimit: t.visitLimit,
    weeklyLimit: t.weeklyLimit,
    allowedWeekdays: t.allowedWeekdays,
    isVip: t.isVip,
    color: t.color,
    status: t.status,
  };
}

/** A day pass ends the same day; anything else runs for a number of days. */
const KIND_DAILY = "daily";
const KIND_PERIOD = "period";

export function TariffFormDialog({
  open,
  onOpenChange,
  tariff,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tariff: Tariff | null;
  onSaved: () => void;
}) {
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;

  const [form, setForm] = useState<TariffInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const formKey = open ? (tariff?.id ?? "new") : null;
  const [prevFormKey, setPrevFormKey] = useState<string | null>(null);
  if (formKey !== prevFormKey) {
    setPrevFormKey(formKey);
    if (open) {
      setForm(tariff ? toInput(tariff) : EMPTY);
      setErrors({});
    }
  }

  const kind = (form.durationDays ?? 0) <= 1 ? KIND_DAILY : KIND_PERIOD;

  function set<K extends keyof TariffInput>(key: K, value: TariffInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Tarif nomi majburiy";
    if (form.price <= 0) next.price = "Narx 0 dan katta bo'lishi kerak";
    if (kind === KIND_PERIOD && (form.durationDays ?? 0) < 1) {
      next.durationDays = "Muddat kamida 1 kun bo'lishi kerak";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setBusy(true);
    try {
      const clean: TariffInput = {
        ...form,
        name: form.name.trim(),
        description: null,
        // A day pass is one day. Visit and weekday limits are no longer
        // configurable, so they are always cleared.
        durationDays: kind === KIND_DAILY ? 1 : form.durationDays,
        visitLimit: null,
        weeklyLimit: null,
        allowedWeekdays: null,
      };
      if (tariff) {
        await updateTariff(tariff.id, clean, tariff, actor);
        toast.success("Tarif yangilandi");
      } else {
        await createTariff(clean, actor);
        toast.success("Tarif qo'shildi");
      }
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Saqlab bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tariff ? "Tarifni tahrirlash" : "Yangi tarif"}</DialogTitle>
          <DialogDescription>
            {tariff
              ? "O'zgarishlar faqat yangi sotuvlarga ta'sir qiladi"
              : "Nomi va narxini kiriting"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field label="Nomi" htmlFor="name" error={errors.name} required>
            <Input
              id="name"
              autoFocus
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Masalan Kunlik yoki 1 Oylik"
              aria-invalid={!!errors.name}
            />
          </Field>

          <Field
            label="Narxi"
            htmlFor="price"
            error={errors.price}
            helper={form.price > 0 ? `${formatSom(form.price)} so'm` : "So'mda"}
            required
          >
            <Input
              id="price"
              inputMode="numeric"
              value={form.price || ""}
              onChange={(e) => set("price", Number(e.target.value) || 0)}
              aria-invalid={!!errors.price}
              className="nums"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Turi" htmlFor="kind">
              <Select
                id="kind"
                value={kind}
                onChange={(e) =>
                  set("durationDays", e.target.value === KIND_DAILY ? 1 : 30)
                }
              >
                <option value={KIND_DAILY}>Kunlik</option>
                <option value={KIND_PERIOD}>Muddatli</option>
              </Select>
            </Field>

            {kind === KIND_PERIOD ? (
              <Field
                label="Muddati"
                htmlFor="durationDays"
                error={errors.durationDays}
                helper="Kunlarda"
                required
              >
                <Input
                  id="durationDays"
                  inputMode="numeric"
                  value={form.durationDays ?? ""}
                  onChange={(e) =>
                    set("durationDays", Number(e.target.value) || 0)
                  }
                  aria-invalid={!!errors.durationDays}
                  className="nums"
                />
              </Field>
            ) : null}
          </div>

          <Field label="Holati" htmlFor="status">
            <Select
              id="status"
              value={form.status}
              onChange={(e) =>
                set("status", e.target.value as TariffInput["status"])
              }
            >
              <option value="active">Faol</option>
              <option value="archived">Arxivlangan</option>
            </Select>
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
      </DialogContent>
    </Dialog>
  );
}
