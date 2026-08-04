import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Layout-shaped placeholder, never a spinner. The shimmer is the one piece of
 * perpetual motion in the app and it is motivated: it distinguishes "loading"
 * from "loaded but empty", which a static grey block does not.
 * Collapses to a flat block under prefers-reduced-motion via globals.css.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-sm bg-muted",
        "after:absolute after:inset-0 after:-translate-x-full",
        "after:bg-gradient-to-r after:from-transparent after:via-foreground/[0.06] after:to-transparent",
        "after:animate-[shimmer_1.6s_infinite]",
        className,
      )}
      {...props}
    />
  );
}

/** Repeated skeleton rows shaped like a table body. */
export function SkeletonRows({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-grid-line", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-3 py-2">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 flex-1 max-w-52" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="ml-auto h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
