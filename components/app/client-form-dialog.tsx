"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SpinnerIcon } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { createClient, updateClient, type ClientInput } from "@/lib/db/mutations";
import type { Client } from "@/lib/db/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

/**
 * A member is a name and a phone number.
 *
 * Locker number is assigned on the daily sheet, where the desk actually hands
 * a key over, so it is not part of the profile. Status, birth date, gender and
 * notes were dropped: nothing in the app read them, and every unused field is
 * one more thing to fill in at a counter with someone waiting.
 */
const EMPTY: ClientInput = {
  firstName: "",
  lastName: null,
  phone: null,
  phone2: null,
  birthDate: null,
  gender: null,
  keyNumber: null,
  note: null,
  status: "active",
};

function toInput(client: Client): ClientInput {
  return {
    firstName: client.firstName,
    lastName: client.lastName,
    phone: client.phone,
    phone2: client.phone2,
    // Carried through untouched so editing a member never wipes a locker
    // number the daily sheet assigned.
    birthDate: client.birthDate,
    gender: client.gender,
    keyNumber: client.keyNumber,
    note: client.note,
    status: client.status,
  };
}

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null creates, a client edits. */
  client: Client | null;
  onSaved: () => void;
}) {
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;

  const [form, setForm] = useState<ClientInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const formKey = open ? (client?.id ?? "new") : null;
  const [prevFormKey, setPrevFormKey] = useState<string | null>(null);
  if (formKey !== prevFormKey) {
    setPrevFormKey(formKey);
    if (open) {
      setForm(client ? toInput(client) : EMPTY);
      setErrors({});
    }
  }

  function set<K extends keyof ClientInput>(key: K, value: ClientInput[K]) {
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
    if (!form.firstName.trim()) next.firstName = "Ism majburiy";
    if (form.phone && !/^\d{9}$/.test(form.phone.replace(/\D/g, ""))) {
      next.phone = "Telefon raqami 9 ta raqamdan iborat bo'lishi kerak";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setBusy(true);
    try {
      const clean: ClientInput = {
        ...form,
        firstName: form.firstName.trim(),
        lastName: form.lastName?.trim() || null,
        phone: form.phone?.replace(/\D/g, "") || null,
        phone2: form.phone2?.replace(/\D/g, "") || null,
      };

      if (client) {
        await updateClient(client.id, clean, client, actor);
        toast.success("Mijoz yangilandi");
      } else {
        await createClient(clean, actor);
        toast.success("Mijoz qo'shildi");
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
          <DialogTitle>{client ? "Mijozni tahrirlash" : "Yangi mijoz"}</DialogTitle>
          <DialogDescription>
            {client
              ? "Mijoz ma'lumotlarini o'zgartiring"
              : "Zalga yozilayotgan mijozni ro'yxatga oling"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ism" htmlFor="firstName" error={errors.firstName} required>
              <Input
                id="firstName"
                autoFocus
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                aria-invalid={!!errors.firstName}
              />
            </Field>

            <Field label="Familiya" htmlFor="lastName">
              <Input
                id="lastName"
                value={form.lastName ?? ""}
                onChange={(e) => set("lastName", e.target.value || null)}
              />
            </Field>

            <Field
              label="Telefon"
              htmlFor="phone"
              error={errors.phone}
              helper="Masalan 93 395 92 92"
            >
              <Input
                id="phone"
                inputMode="tel"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value || null)}
                aria-invalid={!!errors.phone}
                className="nums"
              />
            </Field>

            <Field label="Qo'shimcha telefon" htmlFor="phone2">
              <Input
                id="phone2"
                inputMode="tel"
                value={form.phone2 ?? ""}
                onChange={(e) => set("phone2", e.target.value || null)}
                className="nums"
              />
            </Field>
          </div>

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
