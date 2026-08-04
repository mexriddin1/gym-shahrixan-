import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const VARIANTS = {
  default: "bg-secondary text-secondary-foreground",
  outline: "border-border text-foreground",
  active: "bg-status-active text-status-active-foreground",
  warning: "bg-status-warning text-status-warning-foreground",
  expired: "bg-status-expired text-status-expired-foreground",
  debt: "bg-status-debt text-status-debt-foreground",
  neutral: "bg-status-neutral text-status-neutral-foreground",
} as const;

export type BadgeVariant = keyof typeof VARIANTS;

/**
 * A leading dot so status is never carried by colour alone. The workbook
 * relied purely on fill colour, which is exactly what fails for a colour
 * blind user or a photocopy.
 */
function StatusDot() {
  return (
    <span
      aria-hidden
      className="size-1.5 shrink-0 rounded-full bg-current opacity-70"
    />
  );
}

export function Badge({
  className,
  variant = "default",
  dot = false,
  children,
  ...props
}: ComponentProps<"span"> & { variant?: BadgeVariant; dot?: boolean }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-transparent px-1.5 py-0.5",
        "text-xs font-medium whitespace-nowrap",
        "[&_svg]:pointer-events-none [&_svg]:size-3",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {dot ? <StatusDot /> : null}
      {children}
    </span>
  );
}
