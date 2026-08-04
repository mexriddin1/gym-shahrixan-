import { Button as ButtonPrimitive } from "@base-ui/react/button";

import { cn } from "@/lib/utils";

const VARIANTS = {
  default: "bg-primary text-primary-foreground hover:bg-primary/85",
  brand: "bg-brand text-brand-foreground hover:bg-brand/90",
  outline:
    "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
  ghost: "hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
  destructive:
    "bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
  link: "text-brand underline-offset-4 hover:underline",
} as const;

const SIZES = {
  xs: "h-6 gap-1 rounded-sm px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
  sm: "h-7 gap-1.5 rounded-md px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
  default: "h-8 gap-1.5 rounded-md px-3",
  lg: "h-9 gap-2 rounded-md px-4",
  icon: "size-8 rounded-md",
  "icon-sm": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
  "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

/**
 * Tactile press is deliberate: at this density the click target is small, so
 * the 1px drop is most of the feedback the user gets that it registered.
 */
const BASE =
  "inline-flex shrink-0 select-none items-center justify-center border border-transparent " +
  "text-sm font-medium whitespace-nowrap outline-none transition-colors " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export function buttonClasses({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

/**
 * Base UI allows `className` to be a function of component state. The variant
 * maps need a plain string to merge, so the string form is the only one
 * accepted here; state-driven styling goes through data attributes instead.
 */
export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: Omit<ButtonPrimitive.Props, "className"> & {
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}
