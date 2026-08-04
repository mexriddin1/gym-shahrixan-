"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ListIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  SidebarSimpleIcon,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findNavItem } from "./nav";

export function Topbar({
  onMenuClick,
  onToggleSidebar,
  onLock,
}: {
  onMenuClick: () => void;
  onToggleSidebar: () => void;
  onLock?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const title = findNavItem(pathname)?.label ?? "Kunlik hisob";

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/mijozlar?q=${encodeURIComponent(q)}`);
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 px-3",
        "border-b border-border bg-background/85 backdrop-blur-md sm:px-4",
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        aria-label="Menyuni ochish"
        onClick={onMenuClick}
      >
        <ListIcon />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="hidden lg:inline-flex"
        aria-label="Menyuni yig'ish"
        title="Menyuni yig'ish"
        onClick={onToggleSidebar}
      >
        <SidebarSimpleIcon />
      </Button>

      <h1 className="truncate text-sm font-semibold tracking-tight">{title}</h1>

      <div className="ml-auto flex items-center gap-1.5">
        <form onSubmit={handleSearch} className="relative hidden md:block">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Mijoz yoki telefon"
            aria-label="Mijoz qidirish"
            className="h-7 w-52 pl-8 lg:w-64"
          />
        </form>

        {onLock ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Qulflash"
            title="Qulflash"
            onClick={onLock}
          >
            <LockSimpleIcon />
          </Button>
        ) : null}
      </div>
    </header>
  );
}
