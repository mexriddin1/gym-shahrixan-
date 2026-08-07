"use client";

import { useState, type FormEvent } from "react";
import { setDoc } from "firebase/firestore";
import { toast } from "sonner";
import {
  ColumnsPlusRightIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { settingsDoc } from "@/lib/db/collections";
import { newColumnId, type SheetColumn } from "@/lib/db/types";
import { now, writeAudit, type Actor } from "@/lib/db/write";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/use-confirm";

/**
 * The gym's own money columns on the daily sheet.
 *
 * Kept in settings rather than the schema: every gym charges for something the
 * next one does not, and a locker fee is not worth a migration.
 */
export function SheetColumnSection({
  columns,
  actor,
  onSaved,
}: {
  columns: SheetColumn[];
  actor: Actor;
  onSaved: () => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SheetColumn | null>(null);

  const ordered = [...columns].sort((a, b) => a.position - b.position);

  async function save(next: SheetColumn[], message: string) {
    try {
      await setDoc(
        settingsDoc(),
        // Renumbered on every write so deleting from the middle cannot leave a
        // gap that the next column then collides with.
        {
          sheetColumns: next.map((c, i) => ({ ...c, position: i + 1 })),
          updatedAt: now(),
        } as never,
        { merge: true },
      );
      writeAudit({
        actor,
        action: "update",
        entity: "settings",
        entityId: "app",
        after: { sheetColumns: next.map((c) => c.name) },
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
            Kunlik jadval ustunlari
          </h3>
          <p className="text-xs text-muted-foreground">
            Zal, mahsulot va chegirmadan tashqari o&apos;z ustunlaringiz
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
          Yangi ustun
        </Button>
      </div>

      <div className="overflow-hidden border border-border bg-card">
        {ordered.length === 0 ? (
          <EmptyState
            icon={ColumnsPlusRightIcon}
            title="Qo'shimcha ustun yo'q"
            description="Masalan «Shkaf», «Massaj» yoki «Jarima» ustunini qo'shing."
          />
        ) : (
          <ul className="divide-y divide-grid-line">
            {ordered.map((c, i) => (
              <li
                key={c.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 px-3 py-2.5",
                  "transition-colors hover:bg-grid-row-hover",
                  i % 2 === 1 && "bg-grid-row-alt",
                )}
              >
                <span className="truncate text-sm font-medium">{c.name}</span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${c.name} ni tahrirlash`}
                    onClick={() => {
                      setEditing(c);
                      setDialogOpen(true);
                    }}
                  >
                    <PencilSimpleIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${c.name} ni o'chirish`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      confirm({
                        title: `«${c.name}» ustuni o'chirilsinmi?`,
                        description:
                          "Ustun jadvaldan yo'qoladi. Oldin yozilgan summalar o'z kunidagi Jami hisobida qolib ketadi.",
                        run: () =>
                          save(
                            ordered.filter((x) => x.id !== c.id),
                            "Ustun o'chirildi",
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

      <ColumnDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        column={editing}
        onSubmit={(value) =>
          editing
            ? save(
                ordered.map((c) => (c.id === editing.id ? value : c)),
                "Ustun saqlandi",
              )
            : save([...ordered, value], "Ustun qo'shildi")
        }
      />
    </section>
  );
}

function ColumnDialog({
  open,
  onOpenChange,
  column,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  column: SheetColumn | null;
  onSubmit: (column: SheetColumn) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset from props during render rather than in an effect, which would show
  // the previous column's values for one frame after the dialog opens.
  const [seen, setSeen] = useState<SheetColumn | null | undefined>(undefined);
  if (open && seen !== column) {
    setSeen(column);
    setName(column?.name ?? "");
    setError(null);
  }
  if (!open && seen !== undefined) setSeen(undefined);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Ustun nomi majburiy");
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        id: column?.id ?? newColumnId(),
        name: name.trim(),
        position: column?.position ?? 0,
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
            {column ? "Ustunni tahrirlash" : "Yangi ustun"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Nomi" htmlFor="column-name" error={error} required>
            <Input
              id="column-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Shkaf"
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
