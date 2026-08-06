"use client";

import { useState, type FormEvent } from "react";
import { setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { SpinnerIcon } from "@phosphor-icons/react";

import { settingsDoc } from "@/lib/db/collections";
import { now, writeAudit, type Actor } from "@/lib/db/write";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

/**
 * What one day on the floor costs.
 *
 * Only used as an offer: it fills in the amount when a monthly member is
 * charged for an extra visit, and when someone pays for a single day. The desk
 * can always type over it, so this is a default rather than a price list.
 */
export function DailyFeeSection({
  dailyFee,
  actor,
  onSaved,
}: {
  dailyFee: number;
  actor: Actor;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(dailyFee));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const parsed = Number(value.replace(/\s/g, ""));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Narx manfiy bo'lmasligi kerak");
      return;
    }

    setBusy(true);
    try {
      await setDoc(
        settingsDoc(),
        { dailyFee: Math.round(parsed), updatedAt: now() } as never,
        { merge: true },
      );
      writeAudit({
        actor,
        action: "update",
        entity: "settings",
        entityId: "app",
        before: { dailyFee },
        after: { dailyFee: Math.round(parsed) },
      });
      toast.success("Kunlik narx saqlandi");
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
        <h3 className="text-sm font-semibold tracking-tight">Kunlik narx</h3>
        <p className="max-w-prose text-xs text-muted-foreground">
          Bir kunlik zal to&apos;lovi. Oylik mijoz haftada uchinchi martadan
          ortiq kelganda shu narx taklif qilinadi.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex max-w-xs items-end gap-3"
        noValidate
      >
        <Field
          label="Bosh narx"
          htmlFor="dailyFee"
          error={error}
          className="flex-1"
        >
          <Input
            id="dailyFee"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.replace(/[^\d\s]/g, ""));
              setError(null);
            }}
            aria-invalid={!!error}
            className="nums text-right"
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
