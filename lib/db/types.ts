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

export type PaymentMethod =
  | "cash"
  | "card"
  | "transfer"
  | "click"
  | "payme"
  | "other";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma",
  click: "Click",
  payme: "Payme",
  other: "Boshqa",
};

export type Payment = {
  id: string;
  code: number;
  clientId: string | null;
  clientName: string | null;
  subscriptionId: string | null;
  orderId: string | null;
  amount: number;
  method: PaymentMethod;
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
};

/** Fresh id for a sheet line. */
/** One amount recorded against a custom column. */
export type SheetExtra = {
  amount: number;
  /** Yellow on the sheet, same convention as the floor fee and products. */
  paid?: boolean;
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
