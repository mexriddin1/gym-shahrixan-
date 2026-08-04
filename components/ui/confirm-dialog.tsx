"use client";

import { useState, type FormEvent } from "react";
import { SpinnerIcon } from "@phosphor-icons/react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";

/**
 * Confirmation for an action that is hard to undo, optionally requiring a
 * written reason. Replaces window.confirm/prompt, which cannot be styled, is
 * blocked by some browsers, and reads as a bug in an otherwise designed app.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Tasdiqlash",
  confirmVariant = "destructive",
  reasonLabel,
  reasonPlaceholder,
  option,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  /** When set, a non-empty reason is required before confirming. */
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /**
   * An extra, off-by-default choice that widens what the action removes.
   *
   * Off by default on purpose: the wider action is always the more destructive
   * one, so it has to be reached for deliberately rather than accepted by
   * pressing Enter.
   */
  option?: { label: string; hint?: string };
  onConfirm: (reason: string, optionChecked: boolean) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setReason("");
      setChecked(false);
      setError(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (reasonLabel && !reason.trim()) {
      setError("Sabab majburiy");
      return;
    }

    setBusy(true);
    try {
      await onConfirm(reason.trim(), checked);
      onOpenChange(false);
    } catch {
      // The caller surfaces its own toast; keep the dialog open so the action
      // can be retried without retyping the reason.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {reasonLabel ? (
            <Field label={reasonLabel} htmlFor="confirmReason" error={error} required>
              <Textarea
                id="confirmReason"
                autoFocus
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(null);
                }}
                placeholder={reasonPlaceholder}
                aria-invalid={!!error}
              />
            </Field>
          ) : null}

          {option ? (
            <label className="flex cursor-pointer items-start gap-2.5 border border-border px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-destructive"
              />
              <span className="min-w-0">
                <span className="block">{option.label}</span>
                {option.hint ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
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
            <Button type="submit" variant={confirmVariant} disabled={busy}>
              {busy ? (
                <>
                  <SpinnerIcon className="animate-spin" />
                  Bajarilmoqda
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
