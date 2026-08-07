"use client";

import { useState } from "react";
import { toast } from "sonner";
import { getDocs } from "firebase/firestore";
import {
  PackageIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { productsRef } from "@/lib/db/collections";
import { deleteProduct, setProductOrder } from "@/lib/db/mutations";
import type { Product } from "@/lib/db/types";
import { useResource } from "@/lib/db/use-resource";
import { byCatalogueOrder, reorder } from "@/lib/domain/catalogue";
import { cn, formatSom } from "@/lib/utils";
import { ProductFormDialog } from "@/components/app/product-form-dialog";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/use-confirm";
import { useDragReorder } from "@/components/ui/use-drag-reorder";

async function listAllProducts(): Promise<Product[]> {
  // Sorted here rather than with `orderBy("position")`, which would silently
  // drop any product that has not been given a position yet.
  const snap = await getDocs(productsRef());
  return snap.docs.map((d) => d.data()).sort(byCatalogueOrder);
}

/**
 * Products live in settings alongside tariffs.
 *
 * Creating one here does not put it on any daily sheet: the desk adds it to a
 * member's row on the day they buy it.
 */
export function ProductSection() {
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;

  const { confirm, dialog: confirmDialog } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const { data, loading, error, reload, mutate } = useResource(
    () => listAllProducts(),
    [],
  );
  const products = data ?? [];

  /**
   * Moves a product to another place in the catalogue.
   *
   * The order is the desk's, not the alphabet's: the picker on the daily sheet
   * reads the same list, so putting the things sold most often at the top is
   * worth more than being able to find a name by scanning.
   */
  async function handleMove(from: number, to: number) {
    if (from === to || to < 0 || to >= products.length) return;

    // Positions are left stale on `moved` so the write can tell what actually
    // changed; the copy shown on screen is renumbered to match its new order.
    const moved = reorder(products, from, to);
    mutate(() => moved.map((p, i) => ({ ...p, position: i + 1 })));

    try {
      await setProductOrder(moved);
    } catch {
      mutate(() => products);
      toast.error("Tartibni saqlab bo'lmadi");
    }
  }

  const { drag, listRef, handlers } = useDragReorder(handleMove);

  // While a row is in hand the list shows where it would land, so the drop is
  // a confirmation of what is already on screen rather than a guess.
  const shown = drag ? reorder(products, drag.from, drag.to) : products;
  const grabbedId = drag ? products[drag.from]?.id : null;

  /**
   * Deleted outright rather than archived. Sheet rows snapshot the product
   * name and price at the moment of sale, so a past day's takings survive the
   * product leaving the catalogue.
   */
  async function handleDelete(product: Product) {
    try {
      await deleteProduct(product.id, product, actor);
      toast.success("Mahsulot o'chirildi");
      reload();
    } catch {
      toast.error("O'chirib bo'lmadi");
    }
  }

  return (
    <section className="border-t border-border pt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Mahsulotlar</h3>
          <p className="text-xs text-muted-foreground">
            Kunlik varaqada mijozga biriktiriladi. Tartibni o&apos;zgartirish
            uchun satrni sudrang
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
          Yangi mahsulot
        </Button>
      </div>

      <div className="overflow-hidden border border-border bg-card">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <SkeletonRows rows={4} />
        ) : products.length === 0 ? (
          <EmptyState
            icon={PackageIcon}
            title="Mahsulot yo'q"
            description="Kunlik varaqada sotish uchun mahsulot qo'shing."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <PlusIcon />
                Yangi mahsulot
              </Button>
            }
          />
        ) : (
          <ul
            ref={listRef}
            className={cn(
              "divide-y divide-grid-line",
              // Only while a row is in hand: the rest of the time a finger has
              // to be able to scroll this list like any other.
              drag && "touch-none select-none",
            )}
          >
            {shown.map((p, i) => (
              <li
                key={p.id}
                {...handlers(i)}
                tabIndex={0}
                // Keyboard reordering, with nothing on screen to say so. The
                // arrows that used to do this were removed; this costs two
                // lines and keeps the list usable without a pointer.
                onKeyDown={(e) => {
                  if (!e.altKey) return;
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    void handleMove(i, i - 1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    void handleMove(i, i + 1);
                  }
                }}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 px-3 py-2.5",
                  "cursor-grab transition-colors outline-none",
                  "focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand",
                  i % 2 === 1 && "bg-grid-row-alt",
                  p.id === grabbedId
                    ? "cursor-grabbing bg-brand/10 shadow-sm"
                    : "hover:bg-grid-row-hover",
                )}
              >
                <span className="truncate text-sm font-medium">{p.name}</span>

                <div className="flex items-center gap-2">
                  <span className="nums text-sm font-medium">
                    {formatSom(p.sellPrice)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${p.name} ni tahrirlash`}
                    onClick={() => {
                      setEditing(p);
                      setDialogOpen(true);
                    }}
                  >
                    <PencilSimpleIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${p.name} ni o'chirish`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      confirm({
                        title: `${p.name} o'chirilsinmi?`,
                        description:
                          "Oldingi kunlardagi sotuvlar saqlanib qoladi.",
                        run: () => handleDelete(p),
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

      <ProductFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editing}
        onSaved={reload}
      />
    </section>
  );
}
