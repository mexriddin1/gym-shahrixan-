"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  IdentificationBadgeIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import {
  createWorker,
  deleteWorker,
  updateWorker,
  type WorkerInput,
} from "@/lib/db/mutations";
import { listWorkers } from "@/lib/db/queries";
import { workerFullName, type Worker } from "@/lib/db/types";
import { useResource } from "@/lib/db/use-resource";
import { normaliseOptionalName, normalisePersonName } from "@/lib/domain/names";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/use-confirm";

/**
 * The people the gym pays.
 *
 * A name and nothing more. Rates, hours and contracts belong to a payroll
 * system; what this list exists for is to put a row on the advance sheet, and
 * a row needs a name. Asking for anything else here would be asking the desk
 * to maintain data no screen ever reads.
 *
 * The order is the order they were added, and it is not editable. The advance
 * sheet is read every day, so the third row down has to be the same person it
 * was yesterday.
 */
export function WorkerSection() {
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;

  const { confirm, dialog: confirmDialog } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);

  const { data, loading, error, reload } = useResource(() => listWorkers(), []);
  const workers = data ?? [];

  async function handleDelete(worker: Worker) {
    try {
      await deleteWorker(worker.id, worker, actor);
      toast.success("Ishchi o'chirildi");
      reload();
    } catch {
      toast.error("O'chirib bo'lmadi");
    }
  }

  return (
    <section className="border-t border-border pt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Ishchilar</h3>
          <p className="text-xs text-muted-foreground">
            Avans jadvalida har biriga bitta satr chiqadi
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
          Yangi ishchi
        </Button>
      </div>

      <div className="overflow-hidden border border-border bg-card">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <SkeletonRows rows={3} />
        ) : workers.length === 0 ? (
          <EmptyState
            icon={IdentificationBadgeIcon}
            title="Ishchi yo'q"
            description="Avans yozish uchun avval ishchi qo'shing."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <PlusIcon />
                Yangi ishchi
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-grid-line">
            {workers.map((w, i) => (
              <li
                key={w.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 px-3 py-2.5",
                  "transition-colors hover:bg-grid-row-hover",
                  i % 2 === 1 && "bg-grid-row-alt",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span className="nums text-xs text-muted-foreground">
                    #{w.code}
                  </span>
                  <span className="truncate text-sm font-medium">
                    {workerFullName(w)}
                  </span>
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${workerFullName(w)} ni tahrirlash`}
                    onClick={() => {
                      setEditing(w);
                      setDialogOpen(true);
                    }}
                  >
                    <PencilSimpleIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${workerFullName(w)} ni o'chirish`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      confirm({
                        title: `${workerFullName(w)} o'chirilsinmi?`,
                        description:
                          "Avans jadvalidan chiqadi. Oldin yozilgan avanslari hisobotda saqlanib qoladi.",
                        run: () => handleDelete(w),
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

      <WorkerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        worker={editing}
        onSaved={reload}
        actor={actor}
      />
    </section>
  );
}

function WorkerDialog({
  open,
  onOpenChange,
  worker,
  onSaved,
  actor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null adds, a worker edits. */
  worker: Worker | null;
  onSaved: () => void;
  actor: { id: string; email: string } | null;
}) {
  const [form, setForm] = useState<WorkerInput>({
    firstName: "",
    lastName: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset from props during render rather than in an effect, which would show
  // the previous worker's name for one frame after the dialog opens.
  const formKey = open ? (worker?.id ?? "new") : null;
  const [prevFormKey, setPrevFormKey] = useState<string | null>(null);
  if (formKey !== prevFormKey) {
    setPrevFormKey(formKey);
    if (open) {
      setForm({
        firstName: worker?.firstName ?? "",
        lastName: worker?.lastName ?? null,
      });
      setError(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim()) {
      setError("Ism majburiy");
      return;
    }

    setBusy(true);
    try {
      if (worker) {
        await updateWorker(worker.id, form, worker, actor);
        toast.success("Ishchi yangilandi");
      } else {
        await createWorker(form, actor);
        toast.success("Ishchi qo'shildi");
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
          <DialogTitle>
            {worker ? "Ishchini tahrirlash" : "Yangi ishchi"}
          </DialogTitle>
          <DialogDescription>
            Faqat ism va familiya. Avans summasi kunlik jadvalda yoziladi
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Tidied on blur, the same as the member form, so what the desk
                sees is what gets stored. */}
            <Field label="Ism" htmlFor="worker-first" error={error} required>
              <Input
                id="worker-first"
                autoFocus
                value={form.firstName}
                onChange={(e) => {
                  setForm((f) => ({ ...f, firstName: e.target.value }));
                  setError(null);
                }}
                onBlur={() =>
                  setForm((f) => ({
                    ...f,
                    firstName: normalisePersonName(f.firstName),
                  }))
                }
                aria-invalid={!!error}
              />
            </Field>

            <Field label="Familiya" htmlFor="worker-last">
              <Input
                id="worker-last"
                value={form.lastName ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lastName: e.target.value || null }))
                }
                onBlur={() =>
                  setForm((f) => ({
                    ...f,
                    lastName: normaliseOptionalName(f.lastName),
                  }))
                }
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
              Saqlash
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
