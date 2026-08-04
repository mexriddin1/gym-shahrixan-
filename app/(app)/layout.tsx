"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth/auth-context";
import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { staff, loading, locked, lock } = useAuth();
  const router = useRouter();

  const allowed = !locked && !!staff;

  useEffect(() => {
    if (!loading && !allowed) router.replace("/");
  }, [loading, allowed, router]);

  // Render the shell's shape while resolving so the layout does not jump once
  // auth settles, and so a redirect never flashes app content.
  if (loading || !allowed) return <ShellSkeleton />;

  return (
    <AppShell onLock={lock}>
      {children}
    </AppShell>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-[100dvh]">
      <div className="hidden w-56 shrink-0 border-r border-sidebar-border bg-sidebar p-3 lg:block">
        <Skeleton className="h-7 w-32" />
        <div className="mt-6 space-y-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1">
        <div className="flex h-12 items-center border-b border-border px-4">
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-4 sm:px-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
