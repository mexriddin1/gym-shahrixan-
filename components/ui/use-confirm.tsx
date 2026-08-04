"use client";

import { useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Pending = {
  title: string;
  description?: string;
  confirmLabel?: string;
  run: () => Promise<void> | void;
};

/**
 * One confirmation dialog per screen, shared by every destructive action on it.
 *
 * Deleting is the one thing in this app that cannot be undone, so nothing gets
 * deleted on a single click. Returning a render slot rather than a portal keeps
 * the dialog inside the screen's own tree, so it inherits the theme and closes
 * with the page.
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((next: Pending) => setPending(next), []);

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => !open && setPending(null)}
      title={pending?.title ?? ""}
      description={pending?.description}
      confirmLabel={pending?.confirmLabel ?? "O'chirish"}
      onConfirm={async () => {
        await pending?.run();
      }}
    />
  );

  return { confirm, dialog };
}
