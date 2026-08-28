"use client";

import { useState, type FormEvent } from "react";
import { setDoc } from "firebase/firestore";
import { toast } from "sonner";
import {
  CreditCardIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { settingsDoc } from "@/lib/db/collections";
import { paymentMethodId, type PaymentMethod } from "@/lib/db/types";
import { now, writeAudit, type Actor } from "@/lib/db/write";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/use-confirm";

/**
 * How this gym takes money.
 *
 * In settings rather than the schema for the same reason the sheet's own
 * columns are: the desk that only ever sees cash and the one with a Payme
 * terminal are the same product, and a new payment terminal is not worth a
 * deploy. Ids are stable across a rename, so a payment recorded last month
 * still says what it said.
 */
export function PaymentMethodSection({
  methods,
  actor,
  onSaved,
}: {
  methods: PaymentMethod[];
  actor: Actor;
  onSaved: () => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);

  const ordered = [...methods].sort((a, b) => a.position - b.position);

  async function save(next: PaymentMethod[], message: string) {
    try {
      await setDoc(
        settingsDoc(),
        // Renumbered on every write, so deleting from the middle cannot leave
        // a gap the next method then collides with.
        {
          paymentMethods: next.map((m, i) => ({ ...m, position: i + 1 })),
          updatedAt: now(),
        } as never,
        { merge: true },
      );
      writeAudit({
        actor,
        action: "update",
        entity: "settings",
        entityId: "app",
        after: { paymentMethods: next.map((m) => m.name) },
      });
      toast.success(message);
      onSaved();
    } catch {
      toast.error("Saqlab bo'lmadi");
    }
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            To&apos;lov turlari
          </h3>
          <p className="text-xs text-muted-foreground">
            Kunlik jadval va abonement to&apos;lovlarida chiqadigan ro&apos;yxat
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <PlusIcon />
          Yangi tur
        </Button>
      </div>

      <div className="overflow-hidden border border-border bg-card">
        {ordered.length === 0 ? (
          <EmptyState
            icon={CreditCardIcon}
            title="To'lov turi yo'q"
            description="Kamida bitta tur bo'lishi kerak, masalan «Naqd»."
          />
        ) : (
          <ul className="divide-y divide-grid-line">
            {ordered.map((m, i) => (
              <li
                key={m.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 px-3 py-2.5",
                  "transition-colors hover:bg-grid-row-hover",
                  i % 2 === 1 && "bg-grid-row-alt",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium">{m.name}</span>
                  {/* The first one is what a fresh row opens on, and the desk
                      should be able to see which that is. */}
                  {i === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      standart
                    </span>
                  ) : null}
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${m.name} ni tahrirlash`}
                    onClick={() => {
                      setEditing(m);
                      setDialogOpen(true);
                    }}
                  >
                    <PencilSimpleIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${m.name} ni o'chirish`}
                    // The last method cannot go: every collected charge has to
                    // have something to be recorded under.
                    disabled={ordered.length === 1}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      confirm({
                        title: `«${m.name}» turi o'chirilsinmi?`,
                        description:
                          "Ro'yxatdan yo'qoladi. Shu tur bilan yozilgan eski to'lovlar o'z nomi bilan qolaveradi.",
                        run: () =>
                          save(
                            ordered.filter((x) => x.id !== m.id),
                            "To'lov turi o'chirildi",
                          ),
                      })
                    }
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmDialog}

      <MethodDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        method={editing}
        existing={ordered}
        onSubmit={(value) =>
          editing
            ? save(
                ordered.map((m) => (m.id === editing.id ? value : m)),
                "To'lov turi saqlandi",
              )
            : save([...ordered, value], "To'lov turi qo'shildi")
        }
      />
    </section>
  );
}

function MethodDialog({
  open,
  onOpenChange,
  method,
  existing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  method: PaymentMethod | null;
  existing: PaymentMethod[];
  onSubmit: (method: PaymentMethod) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset from props during render rather than in an effect, which would show
  // the previous method's name for one frame after the dialog opens.
  const [seen, setSeen] = useState<PaymentMethod | null | undefined>(undefined);
  if (open && seen !== method) {
    setSeen(method);
    setName(method?.name ?? "");
    setError(null);
  }
  if (!open && seen !== undefined) setSeen(undefined);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Tur nomi majburiy");
      return;
    }
    const clash = existing.some(
      (m) =>
        m.id !== method?.id &&
        m.name.toLocaleLowerCase("uz") === trimmed.toLocaleLowerCase("uz"),
    );
    if (clash) {
      setError("Bunday tur allaqachon bor");
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        // Renaming keeps the id, so payments already recorded under it follow
        // the new name instead of falling back to the raw id.
        id:
          method?.id ??
          paymentMethodId(
            trimmed,
            existing.map((m) => m.id),
          ),
        name: trimmed,
        position: method?.position ?? 0,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {method ? "To'lov turini tahrirlash" : "Yangi to'lov turi"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Nomi" htmlFor="method-name" error={error} required>
            <Input
              id="method-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Masalan: Payme"
              aria-invalid={!!error}
              autoFocus
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Bekor qilish
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              Saqlash
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
