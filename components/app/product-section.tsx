"use client";

import { useState } from "react";
import { toast } from "sonner";
import { getDocs, orderBy, query } from "firebase/firestore";
import {
  PackageIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { productsRef } from "@/lib/db/collections";
import { deleteProduct } from "@/lib/db/mutations";
import type { Product } from "@/lib/db/types";
import { useResource } from "@/lib/db/use-resource";
import { cn, formatSom } from "@/lib/utils";
import { ProductFormDialog } from "@/components/app/product-form-dialog";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { useConfirm } from "@/components/ui/use-confirm";

async function listAllProducts(): Promise<Product[]> {
  const snap = await getDocs(query(productsRef(), orderBy("name")));
  return snap.docs.map((d) => d.data());
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

  const { data, loading, error, reload } = useResource(() => listAllProducts(), []);
  const products = data ?? [];
  const paged = usePagination(products, 10);

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
            Kunlik varaqada mijozga biriktiriladi
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
            {paged.pageItems.map((p, i) => (
              <li
                key={p.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 px-3 py-2.5",
                  "transition-colors hover:bg-grid-row-hover",
                  (paged.page * 10 + i) % 2 === 1 && "bg-grid-row-alt",
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
