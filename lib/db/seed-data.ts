/**
 * Seed data transcribed from the gym's own workbook photos (oylik_iyul.xlsx,
 * sheets "01,08,2026" and "oylik iyul").
 *
 * Using the real book rather than invented data matters for two reasons: the
 * money and product mix are the ones the app actually has to handle, and the
 * names are real Uzbek names so nothing in the UI is sized against "John Doe".
 *
 * Caveat on totals: the photos were taken at an angle and the JAMI column does
 * not line up reliably with its rows. Only the input cells are transcribed
 * here; every total is recomputed by the app. Do not "correct" these rows
 * against a total read off the photo.
 */

export type SeedTariff = {
  name: string;
  price: number;
  durationDays: number | null;
  visitLimit: number | null;
  isVip: boolean;
};

/** Prices observed in the "oylik iyul" sheet: 400k, 500k and 700k for 1OY. */
export const SEED_TARIFFS: SeedTariff[] = [
  { name: "Kunlik", price: 30_000, durationDays: 1, visitLimit: 1, isVip: false },
  { name: "1 Oylik Standart", price: 400_000, durationDays: 30, visitLimit: null, isVip: false },
  { name: "1 Oylik", price: 500_000, durationDays: 30, visitLimit: null, isVip: false },
  { name: "1 Oylik VIP", price: 700_000, durationDays: 30, visitLimit: null, isVip: true },
  { name: "3 Oylik", price: 1_350_000, durationDays: 90, visitLimit: null, isVip: false },
];

export type SeedProduct = {
  name: string;
  sellPrice: number;
  costPrice: number;
  qty: number;
  minQty: number;
};

/** The product columns of the daily sheet, in the workbook's own order. */
export const SEED_PRODUCTS: SeedProduct[] = [
  { name: "Suv", sellPrice: 5_000, costPrice: 3_000, qty: 120, minQty: 24 },
  { name: "BTS", sellPrice: 10_000, costPrice: 7_000, qty: 40, minQty: 10 },
  { name: "Kreatin", sellPrice: 200_000, costPrice: 150_000, qty: 6, minQty: 2 },
  { name: "Pamp", sellPrice: 25_000, costPrice: 18_000, qty: 18, minQty: 5 },
  { name: "Protayin", sellPrice: 30_000, costPrice: 22_000, qty: 22, minQty: 6 },
  { name: "Energetik", sellPrice: 15_000, costPrice: 10_000, qty: 36, minQty: 12 },
  { name: "Sok", sellPrice: 8_000, costPrice: 5_000, qty: 30, minQty: 12 },
  { name: "Protayin miks", sellPrice: 35_000, costPrice: 26_000, qty: 14, minQty: 4 },
  { name: "Shokolad", sellPrice: 7_000, costPrice: 4_500, qty: 48, minQty: 12 },
  { name: "Yogurt", sellPrice: 9_000, costPrice: 6_000, qty: 24, minQty: 8 },
];

export type SeedClient = {
  firstName: string;
  lastName: string | null;
  phone: string | null;
  keyNumber: number | null;
  /** Tariff name from SEED_TARIFFS, when the sheet showed a monthly price. */
  tariff?: string;
  startDate?: string;
  note?: string;
};

/**
 * Members from the "oylik iyul" sheet. Parenthesised notes in the book are
 * kept as notes rather than being mangled into the name: "(YANGI)" means new,
 * "(ISHXONA)" a workplace group, and the rest are how the desk tells apart
 * two members with the same first name.
 */
export const SEED_CLIENTS: SeedClient[] = [
  { firstName: "Ulugbek", lastName: "Karimov", phone: null, keyNumber: 48, tariff: "1 Oylik", startDate: "2026-08-01", note: "DOM" },
  { firstName: "Islom Bek", lastName: "Qurbonov", phone: "933959292", keyNumber: 2, tariff: "1 Oylik", startDate: "2026-08-01", note: "Aka uka" },
  { firstName: "Azizbek", lastName: "Fayzulooxunov", phone: "958350702", keyNumber: 15, tariff: "1 Oylik", startDate: "2026-08-01", note: "Yangi" },
  { firstName: "Shuxrat", lastName: "Tursinaliyev", phone: "934259898", keyNumber: 13, tariff: "1 Oylik", startDate: "2026-08-01" },
  { firstName: "Asatbek", lastName: "Abdurahonov", phone: "949970006", keyNumber: 36, tariff: "1 Oylik", startDate: "2026-08-01" },
  { firstName: "Muhammadali", lastName: "Mominov", phone: "956370010", keyNumber: 27, tariff: "1 Oylik", startDate: "2026-08-01", note: "Kiyov bola dusti" },
  { firstName: "Abdukarim", lastName: "Nematullaev", phone: "956401717", keyNumber: 19, tariff: "1 Oylik", startDate: "2026-08-01", note: "Sartarosh" },
  { firstName: "Abdumomin", lastName: "Mominov", phone: "884531555", keyNumber: 3, tariff: "1 Oylik", startDate: "2026-08-01", note: "Boxcha" },
  { firstName: "Muxammad Ali", lastName: "Karimov", phone: "979999071", keyNumber: 12, tariff: "1 Oylik", startDate: "2026-08-01", note: "Yangi" },
  { firstName: "Azizbek", lastName: "Yunusov", phone: "948457474", keyNumber: 29, tariff: "1 Oylik", startDate: "2026-08-01", note: "Sartarosh urtagi" },
  { firstName: "Bohodir", lastName: "Soliyev", phone: "907634142", keyNumber: 26, tariff: "1 Oylik", startDate: "2026-06-25", note: "Yangi" },
  { firstName: "Shuxrat", lastName: "Eshmatov", phone: "954810303", keyNumber: 11, tariff: "1 Oylik", startDate: "2026-06-25", note: "Yangi" },
  { firstName: "Doston", lastName: "Oqtonlik", phone: "883393777", keyNumber: 20, tariff: "1 Oylik", startDate: "2026-06-25", note: "Baliq" },
  { firstName: "Xayotbek", lastName: "Maripov", phone: null, keyNumber: 14, tariff: "1 Oylik", startDate: "2026-07-24", note: "Al Xayat" },
  { firstName: "Yaxyobek", lastName: "Xasanov", phone: null, keyNumber: 1, tariff: "1 Oylik Standart", startDate: "2026-07-24" },
  { firstName: "Komoldin", lastName: "Usmonjonov", phone: null, keyNumber: 6, tariff: "1 Oylik Standart", startDate: "2026-07-24", note: "Niner" },
  { firstName: "Samandar", lastName: "Gulomov", phone: "772550113", keyNumber: 8, tariff: "1 Oylik", startDate: "2026-05-25", note: "Ishxona" },
  { firstName: "Shokir", lastName: "Qosimov", phone: null, keyNumber: 22, tariff: "1 Oylik", startDate: "2026-07-23", note: "Ishxona" },
  { firstName: "Axror", lastName: "Qosimov", phone: null, keyNumber: 4, tariff: "1 Oylik", startDate: "2026-07-23", note: "Ishxona" },
  { firstName: "Shuxrat", lastName: "Ismoilov", phone: null, keyNumber: 37, tariff: "1 Oylik", startDate: "2026-07-25", note: "Yangi" },
  { firstName: "Isroiljon", lastName: "Djalilov", phone: "932452080", keyNumber: 18, tariff: "1 Oylik", startDate: "2026-07-27", note: "Yangi" },
  { firstName: "Dovronbek", lastName: "Holiqov", phone: "902538786", keyNumber: 5, tariff: "1 Oylik", startDate: "2026-06-26", note: "Telefon suruw" },
  { firstName: "Abdulaziz", lastName: "Abduvoxobov", phone: null, keyNumber: 8, tariff: "1 Oylik Standart", startDate: "2026-07-26" },
  { firstName: "Sanjarbek", lastName: "Muxtorov", phone: null, keyNumber: 24, tariff: "1 Oylik Standart", startDate: "2026-05-26", note: "Yangi" },
  { firstName: "Xumoyun", lastName: "Qosimov", phone: "940044444", keyNumber: 30, tariff: "1 Oylik", startDate: "2026-07-27", note: "Gaz" },
  { firstName: "Abdulxamid", lastName: "Nomonov", phone: null, keyNumber: 31, tariff: "1 Oylik", startDate: "2026-07-27", note: "Yangi" },
  { firstName: "Maxamadjon", lastName: "Karimov", phone: "888337771", keyNumber: 32, tariff: "1 Oylik", startDate: "2026-07-28", note: "Yangi" },
  { firstName: "Abdurashid", lastName: "Yoldashev", phone: "947513200", keyNumber: 33, tariff: "1 Oylik", startDate: "2026-07-28", note: "Yangi" },
  { firstName: "Jasur", lastName: "Turdaliyev", phone: null, keyNumber: 34, tariff: "1 Oylik", startDate: "2026-07-31", note: "Yangi" },
  { firstName: "Hojakbar", lastName: "Homidov", phone: "934255566", keyNumber: 35, tariff: "1 Oylik", startDate: "2026-06-29", note: "Telefon suruw" },
  { firstName: "Sobirjon", lastName: "Shokirov", phone: "941021715", keyNumber: 38, tariff: "1 Oylik", startDate: "2026-07-28", note: "Yangi" },
  { firstName: "Abdurahmon", lastName: "Obidov", phone: "959403030", keyNumber: 39, tariff: "1 Oylik VIP", startDate: "2026-07-30", note: "Yangi" },
  { firstName: "Iqboljon", lastName: "Polatov", phone: "931175010", keyNumber: 40, tariff: "1 Oylik VIP", startDate: "2026-07-30", note: "Yangi" },
  { firstName: "Jasur", lastName: "Shorofiddinov", phone: "932413907", keyNumber: 41, tariff: "1 Oylik VIP", startDate: "2026-07-31", note: "Yangi" },
  { firstName: "Izzatullo", lastName: "Rahimov", phone: null, keyNumber: 5 },
  { firstName: "Otabek", lastName: "Yo'ldoshev", phone: null, keyNumber: 13 },
  { firstName: "Noxitbek", lastName: "Sodiqov", phone: null, keyNumber: 37 },
  { firstName: "Diyorbek", lastName: "Ismoilov", phone: null, keyNumber: 8 },
  { firstName: "Mansurbek", lastName: "Tolibov", phone: null, keyNumber: 5 },
  { firstName: "Ilhom", lastName: "Rasulov", phone: null, keyNumber: 22 },
];

export type SeedSheetRow = {
  clientKey: number | null;
  clientName: string;
  gymFeeMode: "cash" | "subscription" | "none";
  gymFee: number;
  /** Product name from SEED_PRODUCTS -> so'm charged that day. */
  charges: Record<string, number>;
};

export type SeedItem = {
  productName: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
};

/**
 * Turns a transcribed column total into a quantity.
 *
 * The workbook recorded money per product column, never how many were sold, so
 * the quantity has to be inferred by dividing by the shelf price. Where that
 * does not divide evenly the honest answer is one line at the recorded amount
 * rather than a fabricated count.
 */
export function seedRowItems(row: SeedSheetRow): SeedItem[] {
  return Object.entries(row.charges).map(([productName, amount]) => {
    const product = SEED_PRODUCTS.find((p) => p.name === productName);
    const unit = product?.sellPrice ?? amount;
    const divides = unit > 0 && amount % unit === 0;
    return divides
      ? { productName, unitPrice: unit, qty: amount / unit, lineTotal: amount }
      : { productName, unitPrice: amount, qty: 1, lineTotal: amount };
  });
}

/**
 * The "01,08,2026" daily sheet. "oylik" in the ZAL column means the day was
 * covered by a monthly subscription, so no cash was taken for the floor.
 */
export const SEED_SHEET_DATE = "2026-08-01";

export const SEED_SHEET_ROWS: SeedSheetRow[] = [
  { clientKey: 5, clientName: "Izzatullo", gymFeeMode: "cash", gymFee: 30_000, charges: { Suv: 5_000, BTS: 30_000 } },
  { clientKey: 13, clientName: "Otabek", gymFeeMode: "cash", gymFee: 30_000, charges: { Suv: 25_000, BTS: 10_000 } },
  { clientKey: 37, clientName: "Noxitbek", gymFeeMode: "subscription", gymFee: 0, charges: {} },
  { clientKey: 8, clientName: "Diyorcha", gymFeeMode: "subscription", gymFee: 0, charges: {} },
  { clientKey: 36, clientName: "Abduraxmon", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000, BTS: 15_000 } },
  { clientKey: 6, clientName: "Wuxratbek", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000, BTS: 30_000, Kreatin: 30_000 } },
  { clientKey: 4, clientName: "Ahror", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000, BTS: 10_000 } },
  { clientKey: 18, clientName: "Sobirjon", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000, BTS: 200_000 } },
  { clientKey: 48, clientName: "Ulugbek", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 10_000 } },
  { clientKey: 12, clientName: "Jasur", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000 } },
  { clientKey: 26, clientName: "Iqboljon", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000 } },
  { clientKey: 11, clientName: "Nosirjon", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000 } },
  { clientKey: 14, clientName: "Talantbek", gymFeeMode: "subscription", gymFee: 0, charges: {} },
  { clientKey: 1, clientName: "Abdumutal", gymFeeMode: "subscription", gymFee: 0, charges: {} },
  { clientKey: 15, clientName: "Biloldin", gymFeeMode: "cash", gymFee: 30_000, charges: {} },
  { clientKey: 5, clientName: "Mansurbek", gymFeeMode: "subscription", gymFee: 0, charges: {} },
  { clientKey: 2, clientName: "Iqbol aka", gymFeeMode: "cash", gymFee: 30_000, charges: { Suv: 5_000, BTS: 30_000 } },
  { clientKey: 27, clientName: "Nozim aka", gymFeeMode: "none", gymFee: 0, charges: { Suv: 5_000, BTS: 10_000 } },
  { clientKey: 13, clientName: "Shhrat aka", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000 } },
  { clientKey: 22, clientName: "Ilhom", gymFeeMode: "cash", gymFee: 50_000, charges: { Suv: 5_000 } },
  { clientKey: 8, clientName: "Abdulaaziz", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000 } },
  { clientKey: 11, clientName: "Xojakbar", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000, BTS: 100_000 } },
  { clientKey: 20, clientName: "Doston", gymFeeMode: "cash", gymFee: 50_000, charges: { Suv: 5_000 } },
  { clientKey: 4, clientName: "Doniyor", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000 } },
  { clientKey: 19, clientName: "Mujahid", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000 } },
  { clientKey: 3, clientName: "Shuxratbek", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000 } },
  { clientKey: 12, clientName: "Abdurashid", gymFeeMode: "subscription", gymFee: 0, charges: {} },
  { clientKey: 29, clientName: "Oybek", gymFeeMode: "subscription", gymFee: 0, charges: { Suv: 5_000 } },
];
