"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  PencilSimpleIcon,
  ProhibitIcon,
  ReceiptIcon,
  TagIcon,
  TrashIcon,
  UserIcon,
} from "@phosphor-icons/react";

import {
  getClient,
  getSettings,
  listPayments,
  listSubscriptionsForClient,
  listTariffs,
} from "@/lib/db/queries";
import {
  cancelSubscription,
  deleteSubscription,
  paidBySubscription,
} from "@/lib/db/money-mutations";
import { useAuth } from "@/lib/auth/auth-context";
import { useConfirm } from "@/components/ui/use-confirm";
import { computeDebt } from "@/lib/domain/pricing";
import { useResource } from "@/lib/db/use-resource";
import { derivedStatus } from "@/lib/domain/subscription";
import { cn, dateKey, formatDateKey, formatPhone, formatSom } from "@/lib/utils";
import { ClientFormDialog } from "@/components/app/client-form-dialog";
import { SellTariffDialog } from "@/components/app/sell-tariff-dialog";
import { EditSubscriptionDialog } from "@/components/app/edit-subscription-dialog";
import { PaymentDialog, type PaymentTarget } from "@/components/app/payment-dialog";
import { ReceiptDialog } from "@/components/app/receipt-dialog";
import { PurchaseHistory } from "@/components/app/purchase-history";
import { subscriptionReceipt, type Receipt } from "@/lib/domain/receipt";
import type { Subscription } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Pagination, usePagination } from "@/components/ui/pagination";

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { staff } = useAuth();
  const actor = staff ? { id: staff.id, email: staff.email } : null;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [editOpen, setEditOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<PaymentTarget | null>(null);
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const { data, loading, error, reload } = useResource(async () => {
    const [client, subs, settings, tariffs, payments] = await Promise.all([
      getClient(id),
      listSubscriptionsForClient(id),
      getSettings(),
      listTariffs(),
      listPayments(),
    ]);
    return { client, subs, settings, tariffs, payments };
  }, [id]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <DetailSkeleton />;

  if (!data?.client) {
    return (
      <EmptyState
        icon={UserIcon}
        title="Mijoz topilmadi"
        description="Bu mijoz o'chirilgan yoki havola noto'g'ri bo'lishi mumkin."
        action={
          <Button variant="outline" size="sm" render={<Link href="/mijozlar" />}>
            <ArrowLeftIcon />
            Mijozlar ro&apos;yxati
          </Button>
        }
      />
    );
  }

  const { client, subs, settings, tariffs, payments } = data;

  async function handleCancel(sub: Subscription) {
    try {
      await cancelSubscription(sub.id, sub, actor, "");
      toast.success("Abonement bekor qilindi");
      reload();
    } catch {
      toast.error("Bekor qilib bo'lmadi");
    }
  }

  async function handleDeleteSub(sub: Subscription, withPayments: boolean) {
    try {
      await deleteSubscription(sub.id, sub, actor, { withPayments });
      toast.success(
        withPayments
          ? "Abonement va to'lovlari o'chirildi"
          : "Abonement o'chirildi",
      );
      reload();
    } catch {
      toast.error("O'chirib bo'lmadi");
    }
  }
  const today = dateKey();
  const fullName = `${client.firstName} ${client.lastName ?? ""}`.trim();
  const paidMap = paidBySubscription(payments);

  return (
    <div className="space-y-5">
      <div>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/mijozlar" />}
          className="-ml-2 mb-2 text-muted-foreground"
        >
          <ArrowLeftIcon />
          Mijozlar
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold tracking-tight">{fullName}</h2>
            </div>
            <p className="nums text-sm text-muted-foreground">
              #{client.code}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <PencilSimpleIcon />
              Tahrirlash
            </Button>
            <Button size="sm" onClick={() => setSellOpen(true)}>
              <TagIcon />
              Tarif sotish
            </Button>
          </div>
        </div>
      </div>

      {/* Facts, grouped by hairlines rather than boxed into cards. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-grid-line">
        <Fact label="Telefon" value={formatPhone(client.phone)} mono />
        <Fact label="Qo'shimcha" value={formatPhone(client.phone2)} mono />
      </dl>

      <SubscriptionHistory
        subs={subs}
        today={today}
        warningDays={settings.expiryWarningDays}
        paidMap={paidMap}
        onReceipt={setReceipt}
        onEdit={setEditSub}
        onPay={(target) => {
          setPayTarget(target);
          setPayOpen(true);
        }}
        onCancel={(sub) =>
          confirm({
            title: `${sub.tariffName} bekor qilinsinmi?`,
            description:
              "Yozuv saqlanib qoladi, lekin qarzdorlik ro'yxatidan chiqadi va muddati hisoblanmaydi.",
            confirmLabel: "Bekor qilish",
            run: () => handleCancel(sub),
          })
        }
        onDelete={(sub) =>
          confirm({
            title: `${sub.tariffName} o'chirilsinmi?`,
            description:
              "Abonement butunlay o'chadi. Unga qilingan to'lovlar saqlanib qoladi.",
            option: {
              label: "Bu abonementga qilingan to'lovlarni ham o'chirish",
              hint: "Faqat xato kiritilgan, puli olinmagan sotuv uchun.",
            },
            run: ({ withOption }) => handleDeleteSub(sub, withOption),
          })
        }
      />

      {confirmDialog}

      <PurchaseHistory clientId={client.id} />

      <ClientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        client={client}
        onSaved={reload}
      />

      <SellTariffDialog
        open={sellOpen}
        onOpenChange={setSellOpen}
        client={client}
        tariffs={tariffs}
        onSaved={reload}
      />

      <EditSubscriptionDialog
        open={editSub !== null}
        onOpenChange={(open) => !open && setEditSub(null)}
        subscription={editSub}
        paid={editSub ? (paidMap.get(editSub.id) ?? 0) : 0}
        onSaved={reload}
      />

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        target={payTarget}
        onSaved={reload}
      />

      <ReceiptDialog
        open={receipt !== null}
        onOpenChange={(open) => !open && setReceipt(null)}
        receipt={receipt}
        settings={settings}
      />
    </div>
  );
}

/** Tariffs sold to this member, newest first. */
function SubscriptionHistory({
  subs,
  today,
  warningDays,
  paidMap,
  onReceipt,
  onEdit,
  onPay,
  onCancel,
  onDelete,
}: {
  subs: Subscription[];
  today: string;
  warningDays: number;
  paidMap: Map<string, number>;
  onReceipt: (receipt: Receipt) => void;
  onEdit: (sub: Subscription) => void;
  onPay: (target: PaymentTarget) => void;
  onCancel: (sub: Subscription) => void;
  onDelete: (sub: Subscription) => void;
}) {
  const paged = usePagination(subs, 8);

  return (
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold tracking-tight">
            Abonementlar tarixi
          </h3>
          <p className="nums text-xs text-muted-foreground">{subs.length} ta</p>
        </div>

        <div className="overflow-hidden border border-border bg-card">
          {subs.length === 0 ? (
            <EmptyState
              icon={TagIcon}
              title="Abonement sotilmagan"
              description="Bu mijozga hali birorta tarif sotilmagan."
            />
          ) : (
            <ul className="divide-y divide-grid-line">
              {paged.pageItems.map((sub) => {
                const status = derivedStatus(sub, today, warningDays);
                const discounted = sub.finalPrice !== sub.originalPrice;
                const paid = paidMap.get(sub.id) ?? 0;
                const cancelled = sub.status === "cancelled";
                const debt = cancelled ? 0 : computeDebt(sub.finalPrice, paid);
                return (
                  <li
                    key={sub.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 px-3 py-2.5",
                      debt > 0 && "border-l-2 border-l-status-debt-edge",
                      // A called-off sale is history, not something to act on.
                      cancelled && "text-muted-foreground",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        <span className={cn("truncate", cancelled && "line-through")}>
                          {sub.tariffName}
                        </span>
                        {cancelled ? (
                          <Badge variant="neutral">Bekor qilingan</Badge>
                        ) : null}
                      </p>
                      {/* Expiry is carried by colour on the date itself, so the
                          row stays a date rather than a date plus a label. */}
                      <p
                        className={cn(
                          "nums mt-0.5 text-xs",
                          cancelled
                            ? "text-muted-foreground"
                            : status === "expired"
                              ? "font-medium text-destructive"
                              : status === "expiring"
                                ? "text-status-warning-foreground"
                                : "text-muted-foreground",
                        )}
                      >
                        {formatDateKey(sub.startDate)}
                        {sub.endDate ? ` - ${formatDateKey(sub.endDate)}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="nums text-sm font-medium">
                          {formatSom(sub.finalPrice)}
                        </p>
                        {debt > 0 ? (
                          <p className="nums text-xs text-status-debt-foreground">
                            qarz {formatSom(debt)}
                          </p>
                        ) : discounted ? (
                          <p className="nums text-xs text-muted-foreground line-through">
                            {formatSom(sub.originalPrice)}
                          </p>
                        ) : null}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Chek"
                        onClick={() => onReceipt(subscriptionReceipt(sub, paid))}
                      >
                        <ReceiptIcon />
                      </Button>

                      {/* Sits next to the chek because that is where the
                          question comes from: the member reads the receipt,
                          then asks about the discount. A called-off sale has
                          no terms left worth editing. */}
                      {!cancelled ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${sub.tariffName} ni tahrirlash`}
                          title="Tahrirlash"
                          onClick={() => onEdit(sub)}
                        >
                          <PencilSimpleIcon />
                        </Button>
                      ) : null}

                      {/* Cancelling is the reversible half - the record stays
                          and stops being chased. Deleting is not, so it sits
                          last and reads destructive. */}
                      {sub.status !== "cancelled" ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${sub.tariffName} ni bekor qilish`}
                          title="Bekor qilish"
                          onClick={() => onCancel(sub)}
                        >
                          <ProhibitIcon />
                        </Button>
                      ) : null}

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${sub.tariffName} ni o'chirish`}
                        title="O'chirish"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(sub)}
                      >
                        <TrashIcon />
                      </Button>

                      {debt > 0 ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            onPay({
                              kind: "subscription",
                              id: sub.id,
                              clientId: sub.clientId,
                              clientName: sub.clientName,
                              label: sub.tariffName,
                              debt,
                              // Lets the desk discount while taking the money,
                              // which is when it usually gets agreed.
                              subscription: sub,
                              paid,
                            })
                          }
                        >
                          To&apos;lash
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
    
    <Pagination {...paged} onPageChange={paged.setPage} />
  </section>
  );
}

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-card px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 text-sm", mono && "nums")}>{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-grid-line sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 bg-card px-3 py-2.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden border border-border bg-card">
        <div className="divide-y divide-grid-line">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-3">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
