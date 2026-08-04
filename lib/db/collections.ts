import {
  collection,
  doc,
  getFirestore,
  type CollectionReference,
  type DocumentData,
  type Firestore,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { getFirebaseApp } from "@/lib/firebase";
import type {
  AuditEntry,
  Client,
  DailySheet,
  DailySheetRow,
  Order,
  Payment,
  Product,
  Settings,
  Staff,
  StockMovement,
  Subscription,
  SubscriptionFreeze,
  Tariff,
  Visit,
} from "./types";

export function db(): Firestore {
  return getFirestore(getFirebaseApp());
}

/**
 * Firestore stores no document id inside the document, so every read folds the
 * snapshot id back in and every write strips it out again. Doing it in one
 * place keeps `id` off the wire and out of every query site.
 */
function converter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(model) {
      const { id: _id, ...rest } = model as T & { id?: string };
      void _id;
      return rest as DocumentData;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot) {
      return { id: snapshot.id, ...snapshot.data() } as T;
    },
  };
}

/** For documents keyed by a meaningful id, where the id is already a field. */
function plainConverter<T>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (model) => model as DocumentData,
    fromFirestore: (snapshot: QueryDocumentSnapshot) => snapshot.data() as T,
  };
}

function typed<T extends { id: string }>(path: string): CollectionReference<T> {
  return collection(db(), path).withConverter(converter<T>());
}

export const clientsRef = () => typed<Client>("clients");
export const tariffsRef = () => typed<Tariff>("tariffs");
export const subscriptionsRef = () => typed<Subscription>("subscriptions");
export const paymentsRef = () => typed<Payment>("payments");
export const visitsRef = () => typed<Visit>("visits");
export const productsRef = () => typed<Product>("products");
export const stockMovementsRef = () => typed<StockMovement>("stock_movements");
export const ordersRef = () => typed<Order>("orders");
export const freezesRef = () => typed<SubscriptionFreeze>("subscription_freezes");
export const auditRef = () => typed<AuditEntry>("audit_log");
export const staffRef = () => typed<Staff>("staff");

export const settingsDoc = () =>
  doc(db(), "settings", "app").withConverter(plainConverter<Settings>());

/** daily_sheets/{YYYY-MM-DD} */
export const dailySheetsRef = () =>
  collection(db(), "daily_sheets").withConverter(plainConverter<DailySheet>());

export const dailySheetDoc = (date: string) =>
  doc(db(), "daily_sheets", date).withConverter(plainConverter<DailySheet>());

/** daily_sheets/{YYYY-MM-DD}/rows/{rowId} */
export const dailySheetRowsRef = (date: string) =>
  collection(db(), "daily_sheets", date, "rows").withConverter(
    converter<DailySheetRow>(),
  );

/** counters/{entity} holds the last allocated human-facing `code`. */
export const counterDoc = (entity: CounterName) => doc(db(), "counters", entity);

export type CounterName =
  | "clients"
  | "tariffs"
  | "subscriptions"
  | "payments"
  | "visits"
  | "products"
  | "stock_movements"
  | "orders";

/** Starting values match the Postgres IDENTITY seeds in schema.sql. */
export const COUNTER_START: Record<CounterName, number> = {
  clients: 1000,
  tariffs: 100,
  subscriptions: 1000,
  payments: 1000,
  visits: 1000,
  products: 1000,
  stock_movements: 1000,
  orders: 1000,
};
