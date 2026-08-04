"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

export function SidebarNav({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  /** Icons only. The label still reaches screen readers and the tooltip. */
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex h-full flex-col overflow-y-auto py-3", collapsed ? "px-1.5" : "px-2")}>
      <ul className="space-y-0.5">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                className={cn(
                  "relative flex items-center rounded-md py-2 text-sm outline-none transition-colors",
                  collapsed ? "justify-center px-0" : "gap-2.5 pr-2 pl-2.5",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-brand transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                />
                {collapsed ? (
                  <span className="sr-only">{label}</span>
                ) : (
                  <span className="truncate">{label}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
