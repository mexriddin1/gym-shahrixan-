"use client";

import { useState } from "react";
import { toast } from "sonner";
import { getDocs } from "firebase/firestore";
import {
  CaretDownIcon,
  CaretUpIcon,
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
import { Pagination, usePagination } from "@/components/ui/pagination";
import { useConfirm } from "@/components/ui/use-confirm";

const PAGE_SIZE = 10;

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
  const paged = usePagination(products, PAGE_SIZE);

  /**
   * Moves a product one place up or down the catalogue.
   *
   * The order is the desk's, not the alphabet's: the picker on the daily sheet
   * reads the same list, so putting the things sold most often at the top is
   * worth more than being able to find a name by scanning.
   */
  async function handleMove(product: Product, delta: -1 | 1) {
    const from = products.findIndex((p) => p.id === product.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= products.length) return;

    // Positions are left stale on `moved` so the write can tell what actually
    // changed; the copy shown on screen is renumbered to match its new order.
    const moved = reorder(products, from, to);
    mutate(() => moved.map((p, i) => ({ ...p, position: i + 1 })));

    // Follow it across a page boundary. Without this, nudging the last item on
    // a page down reads as the product having been deleted.
    paged.setPage(Math.floor(to / PAGE_SIZE));

    try {
      await setProductOrder(moved);
    } catch {
      mutate(() => products);
      toast.error("Tartibni saqlab bo'lmadi");
    }
  }

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
            Kunlik varaqada mijozga biriktiriladi. Tartibni o&apos;zingiz
            belgilaysiz
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

      <div className="overflow-hidden border border-border">
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
          <ul className="divide-y divide-grid-line">
            {/* Banded rows. The stripe is keyed off the page index rather than
                `odd:`, so paging forward never flips every band over. */}
            {paged.pageItems.map((p, i) => {
              // Its place in the whole catalogue, not on this page: the ends
              // that cannot move are the list's, not the page's.
              const index = paged.page * PAGE_SIZE + i;
              return (
              <li
                key={p.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 px-3 py-2.5",
                  "transition-colors hover:bg-grid-row-hover",
                  index % 2 === 1 && "bg-grid-row-alt",
                )}
              >
                <span className="truncate text-sm font-medium">{p.name}</span>

                <div className="flex items-center gap-2">
                  <span className="nums text-sm font-medium">
                    {formatSom(p.sellPrice)}
                  </span>
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${p.name} ni yuqoriga surish`}
                      title="Yuqoriga"
                      disabled={index === 0}
                      onClick={() => handleMove(p, -1)}
                    >
                      <CaretUpIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${p.name} ni pastga surish`}
                      title="Pastga"
                      disabled={index === products.length - 1}
                      onClick={() => handleMove(p, 1)}
                    >
                      <CaretDownIcon />
                    </Button>
                  </div>
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
              );
            })}
          </ul>
        )}
      </div>

      <Pagination {...paged} onPageChange={paged.setPage} />

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
