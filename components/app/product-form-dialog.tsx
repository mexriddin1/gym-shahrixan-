"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SpinnerIcon } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import { createProduct, updateProduct, type ProductInput } from "@/lib/db/mutations";
import type { Product } from "@/lib/db/types";
import { formatSom } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

const EMPTY: ProductInput = {
  name: "",
  category: null,
  barcode: null,
  costPrice: 0,
  sellPrice: 0,
  minQty: 0,
  unit: "dona",
  supplier: null,
  imageUrl: null,
  note: null,
  status: "active",
};

function toInput(p: Product): ProductInput {
  return {
    name: p.name,
    category: p.category,
    barcode: p.barcode,
    costPrice: p.costPrice,
    sellPrice: p.sellPrice,
    minQty: p.minQty,
    unit: p.unit,
    supplier: p.supplier,
    imageUrl: p.imageUrl,
    note: p.note,
    status: p.status,
  };
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSaved: () => void;
}) {
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;

  const [form, setForm] = useState<ProductInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Derived during render rather than in an effect. See client-form-dialog.
  const formKey = open ? (product?.id ?? "new") : null;
  const [prevFormKey, setPrevFormKey] = useState<string | null>(null);
  if (formKey !== prevFormKey) {
    setPrevFormKey(formKey);
    if (open) {
      setForm(product ? toInput(product) : EMPTY);
      setErrors({});
    }
  }

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Mahsulot nomi majburiy";
    if (form.sellPrice <= 0) next.sellPrice = "Sotish narxi 0 dan katta bo'lishi kerak";
    if (form.costPrice < 0) next.costPrice = "Kelgan narxi manfiy bo'lmasligi kerak";
    if (form.minQty < 0) next.minQty = "Minimal zaxira manfiy bo'lmasligi kerak";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setBusy(true);
    try {
      const clean: ProductInput = {
        ...form,
        name: form.name.trim(),
        category: form.category?.trim() || null,
        barcode: form.barcode?.trim() || null,
        supplier: form.supplier?.trim() || null,
        imageUrl: form.imageUrl?.trim() || null,
        note: form.note?.trim() || null,
      };
      if (product) {
        await updateProduct(product.id, clean, product, actor);
        toast.success("Mahsulot yangilandi");
      } else {
        await createProduct(clean, actor);
        toast.success("Mahsulot qo'shildi");
      }
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Saqlab bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      setBusy(false);
    }
  }

  const margin = form.sellPrice - form.costPrice;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {product ? "Mahsulotni tahrirlash" : "Yangi mahsulot"}
          </DialogTitle>
          <DialogDescription>
            {product
              ? "Narx va ma'lumotlarni o'zgartiring"
              : "Zaxira Ombor bo'limida kirim qilinadi"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nomi" htmlFor="name" error={errors.name} required>
              <Input
                id="name"
                autoFocus
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Masalan Protayin miks"
                aria-invalid={!!errors.name}
              />
            </Field>

            <Field label="Turkum" htmlFor="category" helper="Ixtiyoriy">
              <Input
                id="category"
                value={form.category ?? ""}
                onChange={(e) => set("category", e.target.value || null)}
                placeholder="Ichimlik, sport ozuqasi"
              />
            </Field>

            <Field
              label="Kelgan narxi"
              htmlFor="costPrice"
              error={errors.costPrice}
              helper={form.costPrice > 0 ? `${formatSom(form.costPrice)} so'm` : "So'mda"}
            >
              <Input
                id="costPrice"
                inputMode="numeric"
                value={form.costPrice || ""}
                onChange={(e) => set("costPrice", Number(e.target.value) || 0)}
                aria-invalid={!!errors.costPrice}
                className="nums"
              />
            </Field>

            <Field
              label="Sotish narxi"
              htmlFor="sellPrice"
              error={errors.sellPrice}
              helper={
                form.sellPrice > 0 && form.costPrice > 0
                  ? `Foyda ${formatSom(margin)} so'm`
                  : "So'mda"
              }
              required
            >
              <Input
                id="sellPrice"
                inputMode="numeric"
                value={form.sellPrice || ""}
                onChange={(e) => set("sellPrice", Number(e.target.value) || 0)}
                aria-invalid={!!errors.sellPrice}
                className="nums"
              />
            </Field>

            <Field
              label="Minimal zaxira"
              htmlFor="minQty"
              error={errors.minQty}
              helper="Shu songa yetganda ogohlantiriladi"
            >
              <Input
                id="minQty"
                inputMode="numeric"
                value={form.minQty || ""}
                onChange={(e) => set("minQty", Number(e.target.value) || 0)}
                aria-invalid={!!errors.minQty}
                className="nums"
              />
            </Field>

            <Field label="O'lchov birligi" htmlFor="unit">
              <Select
                id="unit"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
              >
                <option value="dona">dona</option>
                <option value="litr">litr</option>
                <option value="kg">kg</option>
                <option value="quti">quti</option>
              </Select>
            </Field>

            <Field label="Yetkazib beruvchi" htmlFor="supplier">
              <Input
                id="supplier"
                value={form.supplier ?? ""}
                onChange={(e) => set("supplier", e.target.value || null)}
              />
            </Field>

            <Field label="Holati" htmlFor="status">
              <Select
                id="status"
                value={form.status}
                onChange={(e) =>
                  set("status", e.target.value as ProductInput["status"])
                }
              >
                <option value="active">Faol</option>
                <option value="archived">Arxivlangan</option>
              </Select>
            </Field>
          </div>

          <Field label="Izoh" htmlFor="note">
            <Textarea
              id="note"
              rows={2}
              value={form.note ?? ""}
              onChange={(e) => set("note", e.target.value || null)}
            />
          </Field>

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
              {busy ? (
                <>
                  <SpinnerIcon className="animate-spin" />
                  Saqlanmoqda
                </>
              ) : (
                "Saqlash"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
