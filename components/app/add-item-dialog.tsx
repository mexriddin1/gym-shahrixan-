"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlassIcon, MinusIcon, PackageIcon, PlusIcon } from "@phosphor-icons/react";

import type { Product } from "@/lib/db/types";
import { cn, formatSom } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";

/**
 * Attaches a product to one member's row for the day.
 *
 * Pick, set a quantity, confirm. New products are created in Sozlamalar, not
 * here: the desk is serving someone, not maintaining a catalogue.
 */
export function AddItemDialog({
  open,
  onOpenChange,
  products,
  clientName,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  clientName: string;
  onAdd: (product: Product, qty: number) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSearch("");
      setSelected(null);
      setQty(1);
    }
  }

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const active = products.filter((p) => p.status === "active");
    if (!q) return active;
    return active.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  async function confirm() {
    if (!selected || qty < 1) return;
    setBusy(true);
    try {
      await onAdd(selected, qty);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mahsulot qo&apos;shish</DialogTitle>
          <DialogDescription>{clientName}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mahsulot nomi"
            aria-label="Mahsulot qidirish"
            className="h-9 pl-8"
          />
        </div>

        <div className="-mx-1 max-h-56 overflow-y-auto">
          {results.length === 0 ? (
            <EmptyState
              icon={PackageIcon}
              title="Mahsulot topilmadi"
              description="Yangi mahsulotni Sozlamalar bo'limida qo'shing."
              className="py-8"
            />
          ) : (
            <ul>
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p)}
                    aria-pressed={selected?.id === p.id}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left",
                      "transition-colors outline-none",
                      selected?.id === p.id
                        ? "bg-brand-muted ring-1 ring-brand"
                        : "hover:bg-muted focus-visible:bg-muted",
                    )}
                  >
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <span className="nums shrink-0 text-xs text-muted-foreground">
                      {formatSom(p.sellPrice)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selected.name}</p>
              <p className="nums text-xs text-muted-foreground">
                {formatSom(selected.sellPrice)} × {qty}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Kamaytirish"
                  disabled={qty <= 1}
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  <MinusIcon />
                </Button>
                <Input
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) =>
                    setQty(Math.max(1, Number(e.target.value) || 1))
                  }
                  aria-label="Soni"
                  className="nums h-7 w-12 text-center"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Oshirish"
                  onClick={() => setQty((q) => q + 1)}
                >
                  <PlusIcon />
                </Button>
              </div>

              <span className="nums w-20 text-right text-sm font-semibold">
                {formatSom(selected.sellPrice * qty)}
              </span>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Bekor qilish
          </Button>
          <Button onClick={confirm} disabled={!selected || busy}>
            Qo&apos;shish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
