"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PencilSimpleIcon, PlusIcon, TagIcon, TrashIcon } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { deleteTariff } from "@/lib/db/mutations";
import { listTariffs } from "@/lib/db/queries";
import type { Tariff } from "@/lib/db/types";
import { useResource } from "@/lib/db/use-resource";
import { cn, formatSom } from "@/lib/utils";
import { TariffFormDialog } from "@/components/app/tariff-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { useConfirm } from "@/components/ui/use-confirm";

/**
 * Tariffs live in settings rather than their own screen: they are configured
 * when the gym opens and then barely touched, unlike the members and money
 * that get worked on daily.
 */
export function TariffSection() {
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;

  const { confirm, dialog: confirmDialog } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tariff | null>(null);

  const { data, loading, error, reload } = useResource(() => listTariffs(), []);
  const tariffs = data ?? [];
  const paged = usePagination(tariffs, 10);

  /**
   * Deleted outright rather than archived. A subscription snapshots the tariff
   * name and price when it is sold, so removing the template cannot change
   * what anyone was charged.
   */
  async function handleDelete(tariff: Tariff) {
    try {
      await deleteTariff(tariff.id, tariff, actor);
      toast.success("Tarif o'chirildi");
      reload();
    } catch {
      toast.error("O'chirib bo'lmadi");
    }
  }

  return (
    <section className="border-t border-border pt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Tariflar</h3>
          <p className="text-xs text-muted-foreground">
            Mijozlarga sotiladigan abonement shablonlari
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
          Yangi tarif
        </Button>
      </div>

      <div className="overflow-hidden border border-border bg-card">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <SkeletonRows rows={4} />
        ) : tariffs.length === 0 ? (
          <EmptyState
            icon={TagIcon}
            title="Tarif yo'q"
            description="Mijozlarga sotish uchun kamida bitta tarif kerak."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <PlusIcon />
                Yangi tarif
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-grid-line">
            {/* Banded rows. The stripe is keyed off the page index rather than
                `odd:`, so paging forward never flips every band over. */}
            {paged.pageItems.map((t, i) => (
              <li
                key={t.id}
                className={cn(
                  "group flex flex-wrap items-center justify-between gap-3 px-3 py-2.5",
                  "transition-colors hover:bg-grid-row-hover",
                  (paged.page * 10 + i) % 2 === 1 && "bg-grid-row-alt",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{t.name}</span>
                    {t.isVip ? <Badge variant="warning">VIP</Badge> : null}
                  </div>
                  {/* A day pass needs no subtitle: the price is the whole story. */}
                  {(t.durationDays ?? 0) > 1 ? (
                    <p className="nums text-xs text-muted-foreground">
                      {t.durationDays} kun
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <span className="nums text-sm font-medium">
                    {formatSom(t.price)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t.name} tarifini tahrirlash`}
                    onClick={() => {
                      setEditing(t);
                      setDialogOpen(true);
                    }}
                  >
                    <PencilSimpleIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t.name} tarifini o'chirish`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      confirm({
                        title: `${t.name} tarifi o'chirilsinmi?`,
                        description:
                          "Sotilgan abonementlar saqlanib qoladi, faqat shablon o'chadi.",
                        run: () => handleDelete(t),
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

      <Pagination {...paged} onPageChange={paged.setPage} />

      {confirmDialog}

      <TariffFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tariff={editing}
        onSaved={reload}
      />
    </section>
  );
}
