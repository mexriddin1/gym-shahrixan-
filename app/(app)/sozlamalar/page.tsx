"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CheckIcon, SpinnerIcon } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { isValidPinFormat, PIN_LENGTH } from "@/lib/auth/pin";
import { PageHeader } from "@/components/app/app-shell";
import { TariffSection } from "@/components/app/tariff-section";
import { ProductSection } from "@/components/app/product-section";
import { ReceiptSettingsSection } from "@/components/app/receipt-settings-section";
import { SheetColumnSection } from "@/components/app/sheet-column-section";
import { getSettings } from "@/lib/db/queries";
import { useResource } from "@/lib/db/use-resource";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export default function SettingsPage() {
  const { usingDefaultPin, staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;
  const settings = useResource(() => getSettings(), []);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Sozlamalar"
        subtitle="Tariflar, mahsulotlar, jadval ustunlari, chek va PIN kod"
      />

      <TariffSection />

      <ProductSection />

      <SheetColumnSection
        columns={settings.data?.sheetColumns ?? []}
        actor={actor}
        onSaved={settings.reload}
      />

      <ReceiptSettingsSection />

      <PinSection usingDefaultPin={usingDefaultPin} />
    </div>
  );
}

function PinSection({ usingDefaultPin }: { usingDefaultPin: boolean }) {
  const { changePin } = useAuth();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!isValidPinFormat(pin)) {
      setError(`PIN ${PIN_LENGTH} ta raqamdan iborat bo'lishi kerak`);
      return;
    }
    if (pin !== confirm) {
      setError("PIN kodlar mos kelmadi");
      return;
    }

    setBusy(true);
    try {
      await changePin(pin);
      setPin("");
      setConfirm("");
      setError(null);
      setDone(true);
      toast.success("PIN kod yangilandi");
      setTimeout(() => setDone(false), 2500);
    } catch {
      toast.error("PIN kodni yangilab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-border pt-6">
      <h3 className="mb-1 text-sm font-semibold tracking-tight">PIN kod</h3>
      <p className="mb-3 max-w-prose text-xs text-muted-foreground">
        Tizimga kirish uchun ishlatiladigan 4 xonali kod.
      </p>

      {usingDefaultPin ? (
        <p
          role="alert"
          className="mb-3 rounded-md bg-status-warning px-3 py-2 text-xs text-status-warning-foreground"
        >
          Hozir standart PIN (1234) ishlamoqda. Uni almashtiring.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="max-w-xs space-y-4" noValidate>
        <Field label="Yangi PIN" htmlFor="pin" required>
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            className="nums tracking-[0.4em]"
          />
        </Field>

        <Field label="Takrorlang" htmlFor="confirmPin" error={error} required>
          <Input
            id="confirmPin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={PIN_LENGTH}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            aria-invalid={!!error}
            className="nums tracking-[0.4em]"
          />
        </Field>

        <Button type="submit" disabled={busy || done}>
          {busy ? (
            <>
              <SpinnerIcon className="animate-spin" />
              Saqlanmoqda
            </>
          ) : done ? (
            <>
              <CheckIcon />
              Yangilandi
            </>
          ) : (
            "PIN kodni yangilash"
          )}
        </Button>
      </form>
    </section>
  );
}
