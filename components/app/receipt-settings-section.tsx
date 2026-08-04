"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { setDoc } from "firebase/firestore";
import { SpinnerIcon } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { settingsDoc } from "@/lib/db/collections";
import { getSettings } from "@/lib/db/queries";
import { now, writeAudit } from "@/lib/db/write";
import { useResource } from "@/lib/db/use-resource";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";

/**
 * What gets printed at the top and bottom of every receipt.
 *
 * These are the only gym-wide settings that survived: they are the ones a
 * member actually sees, on a piece of paper they take home.
 */
export function ReceiptSettingsSection() {
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;
  const { data, loading, error, reload } = useResource(() => getSettings(), []);

  if (error) {
    return (
      <section className="border-t border-border pt-6">
        <ErrorState message={error} onRetry={reload} />
      </section>
    );
  }

  if (loading && !data) {
    return (
      <section className="space-y-3 border-t border-border pt-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </section>
    );
  }

  return (
    <ReceiptForm key={data!.gymName} initial={data!} actor={actor} onSaved={reload} />
  );
}

function ReceiptForm({
  initial,
  actor,
  onSaved,
}: {
  initial: Awaited<ReturnType<typeof getSettings>>;
  actor: { id: string; email: string } | null;
  onSaved: () => void;
}) {
  const [gymName, setGymName] = useState(initial.gymName);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [footer, setFooter] = useState(initial.receiptFooter ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!gymName.trim()) {
      setError("Zal nomi majburiy");
      return;
    }

    setBusy(true);
    try {
      await setDoc(
        settingsDoc(),
        {
          gymName: gymName.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          // Kept so the expiry colouring keeps working; not shown here.
          expiryWarningDays: initial.expiryWarningDays,
          receiptFooter: footer.trim() || null,
          updatedAt: now(),
        } as never,
        { merge: true },
      );
      writeAudit({
        actor,
        action: "update",
        entity: "settings",
        entityId: "app",
        before: { gymName: initial.gymName },
        after: { gymName: gymName.trim() },
      });
      toast.success("Chek sozlamalari saqlandi");
      onSaved();
    } catch {
      toast.error("Saqlab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-border pt-6">
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight">Chek</h3>
        <p className="text-xs text-muted-foreground">
          Chekning yuqori va pastki qismida chiqadi
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-md space-y-4" noValidate>
        <Field label="Zal nomi" htmlFor="gymName" error={error} required>
          <Input
            id="gymName"
            value={gymName}
            onChange={(e) => {
              setGymName(e.target.value);
              setError(null);
            }}
            aria-invalid={!!error}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefon" htmlFor="phone">
            <Input
              id="phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="nums"
            />
          </Field>

          <Field label="Manzil" htmlFor="address">
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Pastki yozuv" htmlFor="receiptFooter">
          <Textarea
            id="receiptFooter"
            rows={2}
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            placeholder="Xaridingiz uchun rahmat!"
          />
        </Field>

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
      </form>
    </section>
  );
}
