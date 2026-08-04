"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ArrowCounterClockwiseIcon,
  CalendarBlankIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth/auth-context";
import {
  getSettings,
  getSheetHistory,
  listActiveSubscriptions,
  listAllClients,
  listDebtors,
} from "@/lib/db/queries";
import { collectWalkIns, type WalkIn } from "@/lib/domain/walk-ins";
import { HISTORY_DAYS } from "@/components/app/purchase-history";
import { deleteClient, setClientArchived } from "@/lib/db/mutations";
import type { Client, DerivedSubscriptionStatus } from "@/lib/db/types";
import { useResource } from "@/lib/db/use-resource";
import { derivedStatus } from "@/lib/domain/subscription";
import { cn, dateKey, formatDateKey, formatPhone, formatSom } from "@/lib/utils";
import { PageHeader } from "@/components/app/app-shell";
import { DataTable } from "@/components/grid/data-table";
import { ClientFormDialog } from "@/components/app/client-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/use-confirm";

/** A member plus the end date of their current subscription. */
type Row = Client & {
  subStatus: DerivedSubscriptionStatus | null;
  subEnd: string | null;
  /** Total still owed across all of this member's subscriptions. */
  debt: number;
};

/** Everything on an overdue row reads red, not just the date. */
const overdue = (r: Row) => r.subStatus === "expired" && r.status !== "archived";
const archived = (r: Row) => r.status === "archived";
const owing = (r: Row) => r.debt > 0 && r.status !== "archived";

/**
 * Members, walk-ins and the archive are three different populations, not one
 * list with filters. A walk-in has no subscription, no debt and no ID, so
 * putting them in the same table would be five empty columns per row.
 */
type Tab = "members" | "walkins" | "archive";

export default function ClientsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;

  const { confirm, dialog: confirmDialog } = useConfirm();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [tab, setTab] = useState<Tab>("members");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  // Walk-ins mean scanning two months of daily sheets, so that only happens
  // once the tab has actually been opened, and never again after.
  const [walkInsWanted, setWalkInsWanted] = useState(false);

  const { data, loading, error, reload } = useResource(async () => {
    const [clients, subs, settings, debtors] = await Promise.all([
      listAllClients(),
      listActiveSubscriptions(),
      getSettings(),
      listDebtors(),
    ]);
    return { clients, subs, settings, debtors };
  }, []);

  const walkIns = useResource(async () => {
    if (!walkInsWanted) return null;
    const [history, settings] = await Promise.all([
      getSheetHistory(HISTORY_DAYS),
      getSettings(),
    ]);
    return collectWalkIns(history, settings.sheetColumns);
  }, [walkInsWanted]);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const today = dateKey();
    const warn = data.settings.expiryWarningDays;

    // Latest subscription per member wins; someone who renewed early should
    // show the renewal, not the one about to lapse.
    const latest = new Map<string, (typeof data.subs)[number]>();
    for (const s of data.subs) {
      const current = latest.get(s.clientId);
      if (!current || s.startDate > current.startDate) latest.set(s.clientId, s);
    }

    // Debt is per subscription, so several can roll up onto one member.
    const owed = new Map<string, number>();
    for (const d of data.debtors) {
      if (!d.clientId) continue;
      owed.set(d.clientId, (owed.get(d.clientId) ?? 0) + d.debt);
    }

    return data.clients.map((c) => {
      const sub = latest.get(c.id);
      return {
        ...c,
        subStatus: sub ? derivedStatus(sub, today, warn) : null,
        subEnd: sub?.endDate ?? null,
        debt: owed.get(c.id) ?? 0,
      };
    });
  }, [data]);

  const query = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      // The archive is a separate view, not a section of the main list.
      if (archived(r) !== (tab === "archive")) return false;
      if (!query) return true;
      const name = `${r.firstName} ${r.lastName ?? ""}`.toLowerCase();
      return (
        name.includes(query) ||
        (r.phone ?? "").includes(query) ||
        String(r.code).includes(query)
      );
    });
  }, [rows, query, tab]);

  const filteredWalkIns = useMemo(() => {
    if (!walkIns.data) return [];
    if (!query) return walkIns.data;
    return walkIns.data.filter((w) => w.key.includes(query));
  }, [walkIns.data, query]);

  const archivedCount = rows.filter(archived).length;

  const overdueCount = rows.filter(overdue).length;
  const owingCount = rows.filter(owing).length;

  async function handleArchive(client: Client, next: boolean) {
    try {
      await setClientArchived(client.id, next, client, actor);
      toast.success(next ? "Mijoz arxivlandi" : "Mijoz qaytarildi");
      reload();
    } catch {
      toast.error("O'zgartirib bo'lmadi");
    }
  }

  async function handleDelete(client: Client) {
    try {
      await deleteClient(client.id, client, actor);
      toast.success("Mijoz o'chirildi");
      reload();
    } catch {
      toast.error("O'chirib bo'lmadi");
    }
  }

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        header: "ID",
        cell: ({ row }) => (
          <span
            className={cn(
              "nums",
              overdue(row.original) ? "text-destructive" : "text-muted-foreground",
            )}
          >
            #{row.original.code}
          </span>
        ),
      },
      {
        id: "name",
        header: "Mijoz",
        accessorFn: (r) => `${r.firstName} ${r.lastName ?? ""}`.trim(),
        cell: ({ row }) => (
          <Link
            href={`/mijozlar/${row.original.id}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "font-medium hover:underline",
              overdue(row.original) && "text-destructive",
            )}
          >
            {row.original.firstName} {row.original.lastName ?? ""}
          </Link>
        ),
      },
      {
        accessorKey: "phone",
        header: "Telefon",
        cell: ({ row }) => (
          <span
            className={cn(
              "nums",
              overdue(row.original) ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {formatPhone(row.original.phone)}
          </span>
        ),
      },
      {
        id: "subscription",
        header: "Abonement",
        accessorFn: (r) => r.subEnd ?? "",
        cell: ({ row }) => {
          const { subStatus, subEnd } = row.original;
          if (!subEnd) {
            return <span className="text-xs text-muted-foreground">-</span>;
          }
          return (
            <span
              className={cn(
                "nums",
                subStatus === "expired"
                  ? "font-medium text-destructive"
                  : subStatus === "expiring"
                    ? "text-status-warning-foreground"
                    : "text-muted-foreground",
              )}
            >
              {formatDateKey(subEnd)}
            </span>
          );
        },
      },
      {
        id: "debt",
        header: "Qarz",
        accessorFn: (r) => r.debt,
        cell: ({ row }) =>
          row.original.debt > 0 ? (
            <span className="nums font-medium text-status-debt-foreground">
              {formatSom(row.original.debt)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${row.original.firstName} ni tahrirlash`}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(row.original);
                setDialogOpen(true);
              }}
            >
              <PencilSimpleIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                archived(row.original)
                  ? `${row.original.firstName} ni qaytarish`
                  : `${row.original.firstName} ni arxivlash`
              }
              onClick={(e) => {
                e.stopPropagation();
                const name =
                  `${row.original.firstName} ${row.original.lastName ?? ""}`.trim();
                const toArchive = !archived(row.original);
                confirm({
                  title: toArchive
                    ? `${name} arxivlansinmi?`
                    : `${name} qaytarilsinmi?`,
                  description: toArchive
                    ? "Ro'yxatdan chiqadi va muddat eslatmalarida ko'rinmaydi. Tarixi saqlanib qoladi."
                    : "Yana faol mijozlar ro'yxatiga qaytadi.",
                  confirmLabel: toArchive ? "Arxivlash" : "Qaytarish",
                  run: () => handleArchive(row.original, toArchive),
                });
              }}
            >
              {archived(row.original) ? <ArrowCounterClockwiseIcon /> : <ArchiveIcon />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${row.original.firstName} ni o'chirish`}
              className="text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                const name =
                  `${row.original.firstName} ${row.original.lastName ?? ""}`.trim();
                confirm({
                  title: `${name} o'chirilsinmi?`,
                  description:
                    "Abonementlari va to'lov tarixi bazada qoladi, lekin mijoz ro'yxatdan chiqadi.",
                  run: () => handleDelete(row.original),
                });
              }}
            >
              <TrashIcon />
            </Button>
          </div>
        ),
      },
    ],
    // handleDelete closes over `actor`, which only changes on sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actor?.id, confirm],
  );

  const walkInColumns = useMemo<ColumnDef<WalkIn, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Mijoz",
        accessorFn: (w) => w.name,
        cell: ({ row }) => (
          <Link
            href={`/mijozlar/kunlik/${encodeURIComponent(row.original.key)}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "visits",
        header: "Tashrif",
        accessorFn: (w) => w.visits.length,
        cell: ({ row }) => (
          <span className="nums text-muted-foreground">
            {row.original.visits.length} marta
          </span>
        ),
      },
      {
        id: "lastVisit",
        header: "Oxirgi tashrif",
        accessorFn: (w) => w.lastVisit,
        cell: ({ row }) => (
          <span className="nums text-muted-foreground">
            {formatDateKey(row.original.lastVisit)}
          </span>
        ),
      },
      {
        id: "spent",
        header: "Jami",
        accessorFn: (w) => w.spent,
        cell: ({ row }) => (
          <span className="nums font-medium">{formatSom(row.original.spent)}</span>
        ),
      },
      {
        id: "owed",
        header: "Olinmagan",
        accessorFn: (w) => w.owed,
        cell: ({ row }) =>
          row.original.owed > 0 ? (
            <span className="nums font-medium text-status-debt-foreground">
              {formatSom(row.original.owed)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          ),
      },
    ],
    [],
  );

  const isFiltered = Boolean(query);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mijozlar"
        subtitle={
          tab === "walkins"
            ? walkIns.data
              ? `So'nggi ${HISTORY_DAYS} kunda ${filteredWalkIns.length} ta kunlik mijoz`
              : undefined
            : data
              ? tab === "archive"
                ? `Arxivda ${filtered.length} ta`
                : [
                    `${filtered.length} ta`,
                    owingCount > 0 ? `${owingCount} tasida qarz` : null,
                    overdueCount > 0
                      ? `${overdueCount} tasining muddati o'tgan`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
              : undefined
        }
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <PlusIcon />
            Yangi mijoz
          </Button>
        }
      />

      {/* Underlined tabs rather than buttons: this switches which population is
          on screen, which is navigation, not an action. */}
      <div
        role="tablist"
        aria-label="Mijoz turlari"
        className="flex items-center gap-1 border-b border-border"
      >
        <Tab
          active={tab === "members"}
          onClick={() => setTab("members")}
          icon={<UsersIcon />}
          label="A'zolar"
          count={rows.filter((r) => !archived(r)).length}
        />
        <Tab
          active={tab === "walkins"}
          onClick={() => {
            setTab("walkins");
            setWalkInsWanted(true);
          }}
          icon={<CalendarBlankIcon />}
          label="Kunlik"
          count={walkIns.data?.length}
        />
        <Tab
          active={tab === "archive"}
          onClick={() => setTab("archive")}
          icon={<ArchiveIcon />}
          label="Arxiv"
          count={archivedCount}
        />
      </div>

      <div className="relative max-w-md">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            // Keep the URL honest so the view is shareable and reloadable.
            const next = new URLSearchParams(params.toString());
            if (e.target.value) next.set("q", e.target.value);
            else next.delete("q");
            router.replace(`/mijozlar?${next.toString()}`, { scroll: false });
          }}
          placeholder={
            tab === "walkins" ? "Ism bo'yicha qidirish" : "Ism, telefon yoki ID"
          }
          aria-label="Mijoz qidirish"
          className="pl-8"
        />
      </div>

      {tab === "walkins" ? (
        <DataTable
          columns={walkInColumns}
          data={filteredWalkIns}
          loading={walkIns.loading && !walkIns.data}
          error={walkIns.error}
          onRetry={walkIns.reload}
          onRowClick={(w) =>
            router.push(`/mijozlar/kunlik/${encodeURIComponent(w.key)}`)
          }
          rowClassName={(w) =>
            w.owed > 0 ? "bg-status-debt/40 hover:bg-status-debt/55" : undefined
          }
          empty={
            <EmptyState
              icon={CalendarBlankIcon}
              title={isFiltered ? "Topilmadi" : "Kunlik mijoz yo'q"}
              description={
                isFiltered
                  ? "Qidiruvni o'zgartirib ko'ring."
                  : `So'nggi ${HISTORY_DAYS} kunda kunlik varaqaga a'zo bo'lmagan hech kim yozilmagan.`
              }
            />
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          error={error}
          onRetry={reload}
          onRowClick={(row) => router.push(`/mijozlar/${row.id}`)}
          // A faint red wash so an overdue member is findable while scanning,
          // without shouting over the rows that are fine.
          // Three states, one tint each, in order of what needs doing about it:
          // archived is settled, debt needs collecting, expiry needs a call.
          rowClassName={(row) =>
            archived(row)
              ? "bg-paid/50 hover:bg-paid/65"
              : owing(row)
                ? "bg-status-debt/40 hover:bg-status-debt/55"
                : overdue(row)
                  ? "bg-status-expired/35 hover:bg-status-expired/50"
                  : undefined
          }
          empty={
          <EmptyState
            icon={UsersIcon}
            title={
              tab === "archive"
                ? "Arxiv bo'sh"
                : isFiltered
                  ? "Mijoz topilmadi"
                  : "Hozircha mijoz yo'q"
            }
            description={
              isFiltered
                ? "Qidiruvni o'zgartirib ko'ring."
                : "Birinchi mijozni qo'shish uchun «Yangi mijoz» tugmasini bosing."
            }
            action={
              isFiltered ? (
                <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                  Qidiruvni tozalash
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                >
                  <PlusIcon />
                  Yangi mijoz
                </Button>
              )
            }
          />
          }
        />
      )}

      {confirmDialog}

      <ClientFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        client={editing}
        onSaved={reload}
      />
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
        active
          ? "border-foreground font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="[&>svg]:size-4">{icon}</span>
      {label}
      {count !== undefined && count > 0 ? (
        <span className="nums text-xs text-muted-foreground">{count}</span>
      ) : null}
    </button>
  );
}
