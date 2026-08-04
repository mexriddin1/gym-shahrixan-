"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { usePersistedFlag } from "@/lib/use-persisted-flag";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * Screens that get the full width of the main column.
 *
 * The reading width that suits a form or a list is wrong for the daily sheet:
 * it is a spreadsheet, and every pixel taken away from it is a product column
 * the desk has to scroll to reach.
 */
const FULL_WIDTH_ROUTES = ["/kunlik"];

/** Remembers whether the rail is collapsed, per device. */
const COLLAPSE_KEY = "gymos.sidebarCollapsed";

export function AppShell({
  children,
  onLock,
}: {
  children: ReactNode;
  onLock?: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, toggleSidebar] = usePersistedFlag(COLLAPSE_KEY);
  const pathname = usePathname();
  const fullWidth = FULL_WIDTH_ROUTES.some((r) => pathname.startsWith(r));

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Desktop rail */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border bg-sidebar lg:block",
          "transition-[width] duration-150",
          collapsed ? "w-12" : "w-56",
        )}
      >
        <SidebarNav collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent title="Navigatsiya" className="lg:hidden">
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[padding] duration-150",
          collapsed ? "lg:pl-12" : "lg:pl-56",
        )}
      >
        <Topbar
          onMenuClick={() => setMobileOpen(true)}
          onToggleSidebar={toggleSidebar}
          onLock={onLock}
        />
        <main className="flex-1">
          <div
            className={cn(
              "mx-auto w-full px-4 py-4 sm:px-6 sm:py-5",
              fullWidth ? "max-w-none" : "max-w-[1400px]",
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Page header used by every screen. Title and optional actions, separated by
 * space rather than wrapped in a card.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-0.5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
