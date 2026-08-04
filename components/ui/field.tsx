import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Label above input, helper optional, error below. Section 4.6 of the design
 * skill, and the shape every form in the app uses.
 */
export function Field({
  label,
  htmlFor,
  helper,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  helper?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const helperId = helper ? `${htmlFor}-helper` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {helper && !error ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "text-xs font-medium text-foreground select-none",
        className,
      )}
      {...props}
    />
  );
}
