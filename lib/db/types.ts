import type { Timestamp } from "firebase/firestore";

/**
 * Domain types mirroring gym/server/src/schema.sql field for field, so
 * behaviour does not drift from the system these rules were proven in.
 *
 * Conventions:
 * - Money is an integer count of so'm. Never a float.
 * - Calendar dates (start, end, sheet day) are "YYYY-MM-DD" strings, because
 *   the business reasons in whole Tashkent days, not instants.
 * - Instants (createdAt, paidAt) are Firestore Timestamps.
 * - `code` is the human-facing sequential number, allocated from counters/.
 */

export type DateKey = string;

export type Role = "main_admin" | "seller";

export type Staff = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  /** Salted hash of the 4-digit desk PIN. Never the PIN itself. */
  pinHash: string | null;
  createdAt: Timestamp;
};

export type ClientStatus = "active" | "inactive" | "blocked" | "archived";
export type Gender = "male" | "female";

export type Client = {
  id: string;
  code: number;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  phone2: string | null;
  birthDate: DateKey | null;
  gender: Gender | null;
  /** Locker/key number, the "kalit raqami" column in the workbook. */
  keyNumber: number | null;
  note: string | null;
  status: ClientStatus;
  createdBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Faol",
  inactive: "Faol emas",
  blocked: "Bloklangan",
  archived: "Arxivlangan",
};

export type TariffStatus = "active" | "archived";

export type Tariff = {
  id: string;
  code: number;
  name: string;
  description: string | null;
  price: number;
  /** Validity in days. null means visit-only. */
  durationDays: number | null;
  /** Total visits. null means unlimited. */
  visitLimit: number | null;
  /** Max visits per week. null means no limit. */
  weeklyLimit: number | null;
  /** 1=Mon .. 7=Sun. null or empty means every day. */
  allowedWeekdays: number[] | null;
  isVip: boolean;
  color: string | null;
  status: TariffStatus;
  createdBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export const WEEKDAYS = [
  { value: 1, label: "Du" },
  { value: 2, label: "Se" },
  { value: 3, label: "Ch" },
  { value: 4, label: "Pa" },
  { value: 5, label: "Ju" },
  { value: 6, label: "Sh" },
  { value: 7, label: "Ya" },
] as const;

/** Stored status. `expired` and `expiring` are derived, never written. */
export type SubscriptionStatus = "active" | "frozen" | "cancelled";

/** Status after deriving expiry from endDate. What the UI actually renders. */
export type DerivedSubscriptionStatus =
  | SubscriptionStatus
  | "pending"
  | "expiring"
  | "expired";

export const SUBSCRIPTION_STATUS_LABELS: Record<DerivedSubscriptionStatus, string> = {
  active: "Faol",
  frozen: "Muzlatilgan",
  cancelled: "Bekor qilingan",
  pending: "Boshlanmagan",
  expiring: "Tugash arafasida",
  expired: "Muddati o'tgan",
};

export type DiscountType = "none" | "amount" | "percent" | "fixed" | "free";

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  none: "Chegirmasiz",
  amount: "Summa chegirma",
  percent: "Foiz chegirma",
  fixed: "Belgilangan narx",
  free: "Bepul",
};

/**
 * A tariff SOLD to a client. Terms are snapshotted at sale time so later
 * edits to the tariff template never rewrite a past sale.
 */
export type Subscription = {
  id: string;
  code: number;
  clientId: string;
  clientName: string;
  tariffId: string | null;
  tariffName: string;
  originalPrice: number;
  discountType: DiscountType;
  discountValue: number;
  discountReason: string | null;
  finalPrice: number;
  durationDays: number | null;
  visitLimit: number | null;
  weeklyLimit: number | null;
  allowedWeekdays: number[] | null;
  isVip: boolean;
  visitsUsed: number;
  startDate: DateKey;
  endDate: DateKey | null;
  endDateManual: boolean;
  status: SubscriptionStatus;
  note: string | null;
  createdBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * How money came in, referenced by id.
 *
 * A stored id rather than a union, because which methods a gym takes is a
 * business fact that moves without a deploy: one desk sees nothing but cash,
 * the next adds Payme the week the terminal arrives. The list lives in
 * settings, and a payment keeps the id it was recorded under even if that
 * method is later renamed or removed - see `paymentMethodLabel`.
 */
export type PaymentMethodId = string;

export type PaymentMethod = {
  id: PaymentMethodId;
  name: string;
  /** Order in the picker, 1-based. */
  position: number;
};

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: "cash", name: "Naqd", position: 1 },
  { id: "click", name: "Click", position: 2 },
];

/**
 * Names for the ids the app used to hand out from a fixed list.
 *
 * Payments recorded before the list became editable carry these ids and must
 * keep reading as what they were, whether or not the gym still offers them.
 */
const LEGACY_PAYMENT_METHOD_NAMES: Record<string, string> = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma",
  click: "Click",
  payme: "Payme",
  other: "Boshqa",
};

/** What to print for a recorded method id. Never blank, never the raw id. */
export function paymentMethodLabel(
  id: PaymentMethodId | null | undefined,
  methods: readonly PaymentMethod[],
): string {
  if (!id) return "Belgilanmagan";
  return (
    methods.find((m) => m.id === id)?.name ??
    LEGACY_PAYMENT_METHOD_NAMES[id] ??
    id
  );
}

/**
 * A stable id for a newly added method, slugged from its name.
 *
 * Slugged rather than random so the value sitting on a payment is readable in
 * the console, and so a gym that adds "Payme" lands on the same id the old
 * fixed list used - which is what lets older payments keep their name.
 */
export function paymentMethodId(
  name: string,
  taken: readonly string[],
): PaymentMethodId {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "usul";
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export type Payment = {
  id: string;
  code: number;
  clientId: string | null;
  clientName: string | null;
  subscriptionId: string | null;
  orderId: string | null;
  amount: number;
  method: PaymentMethodId;
  note: string | null;
  paidAt: Timestamp;
  createdBy: string | null;
};

export type Visit = {
  id: string;
  code: number;
  clientId: string;
  subscriptionId: string | null;
  checkInAt: Timestamp;
  checkOutAt: Timestamp | null;
  overrideReason: string | null;
  note: string | null;
  createdBy: string | null;
};

export type ProductStatus = "active" | "archived";

export type Product = {
  id: string;
  code: number;
  name: string;
  /**
   * Where this sits in the catalogue, 1-based. Set by staff in Sozlamalar and
   * renumbered on every move, so it never carries gaps or duplicates.
   */
  position: number;
  category: string | null;
  barcode: string | null;
  costPrice: number;
  sellPrice: number;
  qty: number;
  minQty: number;
  unit: string;
  supplier: string | null;
  imageUrl: string | null;
  note: string | null;
  status: ProductStatus;
  createdBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type MovementType =
  | "in"
  | "sale"
  | "return"
  | "damage"
  | "lost"
  | "staff"
  | "free"
  | "adjust";

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  in: "Kirim",
  sale: "Sotuv",
  return: "Qaytarish",
  damage: "Buzilgan",
  lost: "Yo'qolgan",
  staff: "Xodimga",
  free: "Bepul",
  adjust: "Tuzatish",
};

/**
 * `qty` is a SIGNED delta: positive for in/return, negative for sale/damage.
 * Product qty is only ever changed by writing one of these in a transaction,
 * never by assigning to product.qty directly.
 */
export type StockMovement = {
  id: string;
  code: number;
  productId: string;
  productName: string;
  type: MovementType;
  qty: number;
  unitCost: number | null;
  qtyBefore: number;
  qtyAfter: number;
  supplier: string | null;
  reason: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: Timestamp;
};

export type OrderStatus = "open" | "cancelled" | "returned";

export type OrderItem = {
  productId: string | null;
  productName: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
};

export type Order = {
  id: string;
  code: number;
  /** null for a walk-in sale with no client profile. */
  clientId: string | null;
  clientName: string | null;
  items: OrderItem[];
  total: number;
  discount: number;
  finalPrice: number;
  status: OrderStatus;
  note: string | null;
  createdBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type SubscriptionFreeze = {
  id: string;
  subscriptionId: string;
  fromDate: DateKey;
  /** null while the freeze is still open. */
  toDate: DateKey | null;
  reason: string | null;
  createdBy: string | null;
  createdAt: Timestamp;
};

export type Settings = {
  gymName: string;
  phone: string | null;
  address: string | null;
  /** Days before expiry that a subscription starts showing as "expiring". */
  expiryWarningDays: number;
  receiptFooter: string | null;
  /**
   * Extra money columns on the daily sheet, defined by the gym.
   *
   * The sheet ships with the charges every gym has (floor fee, products,
   * discount). Anything else a particular gym sells at the desk - a locker, a
   * massage, a fine - is theirs to name, so it lives in settings rather than
   * in the schema.
   */
  sheetColumns: SheetColumn[];
  /**
   * How this gym takes money, in picker order.
   *
   * Ships with cash and Click because that is what a desk starts with; a
   * terminal, a bank transfer or a staff tab is the gym's own to add.
   */
  paymentMethods: PaymentMethod[];
  updatedAt: Timestamp;
};

export type SheetColumn = {
  id: string;
  name: string;
  /** Left-to-right order on the sheet. */
  position: number;
};

export function newColumnId(): string {
  return crypto.randomUUID();
}

export const DEFAULT_SETTINGS: Omit<Settings, "updatedAt"> = {
  gymName: "GymOS",
  phone: null,
  address: null,
  expiryWarningDays: 3,
  receiptFooter: "Xaridingiz uchun rahmat!",
  sheetColumns: [],
  paymentMethods: DEFAULT_PAYMENT_METHODS,
};

export type AuditAction = "create" | "update" | "delete" | "cancel" | "restore";

export type AuditEntry = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: Timestamp;
};

/* ------------------------------------------------------------------ */
/* Daily tracking sheet - the direct replacement for the workbook tabs */
/* ------------------------------------------------------------------ */

/**
 * How the gym fee was settled for a row on a given day.
 * `subscription` renders as "oylik", matching the workbook.
 */
export type GymFeeMode = "cash" | "subscription" | "none";

/**
 * One product sold to one member on one day.
 *
 * Name and price are snapshotted so renaming a product, or changing what it
 * costs, never rewrites what a past day's sheet says was sold.
 */
export type SheetItem = {
  /**
   * Identifies this line, not the product.
   *
   * A member can buy the same thing twice in a day with a payment in between,
   * and those have to stay separate lines: one settled, one not. Keying by
   * product id would collapse them and mark the new purchase as already paid.
   */
  lineId: string;
  productId: string;
  productName: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
  /** True once the money is actually in hand. See `gymFeePaid`. */
  paid?: boolean;
  /**
   * How that money came in, set at the moment it was marked collected.
   *
   * Absent on a line settled before the sheet asked, and on one that is not
   * settled at all. Never guessed: attributing cash to Click is worse than
   * admitting the sheet does not say.
   */
  method?: PaymentMethodId;
};

/** Fresh id for a sheet line. */
/** One amount recorded against a custom column. */
export type SheetExtra = {
  amount: number;
  /** Yellow on the sheet, same convention as the floor fee and products. */
  paid?: boolean;
  /** How it was settled. See `SheetItem.method`. */
  method?: PaymentMethodId;
};

export function newLineId(): string {
  return crypto.randomUUID();
}

export type DailySheetRow = {
  id: string;
  /** Position in the sheet, 1-based, matching the workbook's No column. */
  position: number;
  clientId: string | null;
  clientName: string;
  /**
   * Locker number, entered on the sheet.
   *
   * Deliberately not inherited from the member record: the key is whatever was
   * free when they walked in, and it differs from one day to the next.
   */
  keyNumber: number | null;
  gymFeeMode: GymFeeMode;
  gymFee: number;
  /**
   * Whether the floor fee has actually been collected.
   *
   * The gym does not take payment up front, so a number on the sheet is a
   * charge, not a receipt. The desk marks it once the cash is in hand, which
   * is what the highlighter yellow meant in the workbook.
   */
  gymFeePaid?: boolean;
  /** How the floor fee was settled. See `SheetItem.method`. */
  gymFeeMethod?: PaymentMethodId;
  /**
   * The method the desk currently has selected for this row.
   *
   * Not a record of anything on its own - it is what the next charge marked
   * collected will be stamped with. Kept on the row rather than in component
   * state so a member who pays by Click still reads as Click after a refresh,
   * and so switching it partway through leaves the charges already settled
   * exactly as they were recorded.
   */
  paymentMethod?: PaymentMethodId | null;
  /**
   * Amounts recorded against the gym's own columns, keyed by column id.
   *
   * Absent on rows written before a column existed, and kept even if the
   * column is later deleted: money that changed hands is not unrecorded by
   * renaming the page it was written on.
   */
  extras?: Record<string, SheetExtra>;
  /** What this member bought today. Empty for someone who just trained. */
  items: SheetItem[];
  /** Taken off the row total, at the staff member's discretion. */
  discount: number;
  note: string | null;
  createdBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type DailySheet = {
  /** Document id, also the day: "2026-08-03". */
  date: DateKey;
  closedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * What this member owes for the day: floor fee when paid in cash, plus
 * everything they bought, less any discount.
 *
 * Clamped at zero for the same reason `computeDebt` is: an over-discount is a
 * mistake at the till, not money the gym owes the member.
 */
export function rowTotal(
  row: Pick<
    DailySheetRow,
    "gymFeeMode" | "gymFee" | "items" | "discount" | "extras"
  >,
) {
  const fee = row.gymFeeMode === "cash" ? row.gymFee : 0;
  const items = row.items.reduce((sum, i) => sum + i.lineTotal, 0);
  return Math.max(0, fee + items + extrasTotal(row.extras) - row.discount);
}

/** Every amount recorded against a custom column, live or since deleted. */
export function extrasTotal(extras: DailySheetRow["extras"]): number {
  return Object.values(extras ?? {}).reduce((sum, e) => sum + e.amount, 0);
}

/**
 * What has actually been collected from this row.
 *
 * The discount is not applied here: it reduces what is owed, and marking a
 * charge paid says that specific amount changed hands.
 */
export function rowCollected(
  row: Pick<
    DailySheetRow,
    "gymFeeMode" | "gymFee" | "gymFeePaid" | "items" | "extras"
  >,
) {
  const fee = row.gymFeeMode === "cash" && row.gymFeePaid ? row.gymFee : 0;
  const extras = Object.values(row.extras ?? {}).reduce(
    (sum, e) => sum + (e.paid ? e.amount : 0),
    0,
  );
  return row.items.reduce(
    (sum, i) => sum + (i.paid ? i.lineTotal : 0),
    fee + extras,
  );
}

/** One settled charge and the method it came in under. */
export type CollectedByMethod = {
  method: PaymentMethodId | null;
  amount: number;
};

/**
 * What this row has collected, split by how the money came in.
 *
 * A charge settled before the sheet recorded a method has none, and comes back
 * under `null` rather than folded into cash. The desk reconciling a till needs
 * to see that a number is unattributed, not be told a plausible answer.
 *
 * Sums to `rowCollected` for any row, which is what makes the split safe to
 * print next to the day's takings.
 */
export function rowCollectedByMethod(
  row: Pick<
    DailySheetRow,
    | "gymFeeMode"
    | "gymFee"
    | "gymFeePaid"
    | "gymFeeMethod"
    | "items"
    | "extras"
  >,
): CollectedByMethod[] {
  const out: CollectedByMethod[] = [];

  if (row.gymFeeMode === "cash" && row.gymFeePaid && row.gymFee > 0) {
    out.push({ method: row.gymFeeMethod ?? null, amount: row.gymFee });
  }
  for (const extra of Object.values(row.extras ?? {})) {
    if (extra.paid && extra.amount > 0) {
      out.push({ method: extra.method ?? null, amount: extra.amount });
    }
  }
  for (const item of row.items) {
    if (item.paid && item.lineTotal > 0) {
      out.push({ method: item.method ?? null, amount: item.lineTotal });
    }
  }

  return out;
}

/** Rolls several rows' settled charges into one total per method. */
export function totalsByMethod(
  rows: readonly Parameters<typeof rowCollectedByMethod>[0][],
): Map<PaymentMethodId | null, number> {
  const totals = new Map<PaymentMethodId | null, number>();
  for (const row of rows) {
    for (const { method, amount } of rowCollectedByMethod(row)) {
      totals.set(method, (totals.get(method) ?? 0) + amount);
    }
  }
  return totals;
}
