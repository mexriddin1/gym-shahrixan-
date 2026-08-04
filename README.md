# GymOS

Sport zali boshqaruv tizimi. Next.js 16, Tailwind v4, Firebase (Auth + Firestore).

Replaces a shared Excel workbook (`oylik_iyul.xlsx`): ~185 members, one sheet
tab per day, product columns totalled by hand. The design keeps what made the
spreadsheet fast (dense rows, ruled hairlines, tabular figures, keyboard cell
navigation) without imitating Office chrome.

## Running it

```bash
npm install
npm run dev
```

`.env.local` already holds the Firebase web config. Those values are public by
design; access control lives in `firestore.rules`, not in the config.

## First run

Nothing can log in until one admin exists. `firestore.rules` requires an active
`staff/{uid}` document in order to write `staff/{uid}`, which is deliberate and
means there is no self-service signup.

Against the emulator:

```bash
npm run emulators
npm run bootstrap:admin -- admin@gym.uz parol123
npm run seed                       # loads the workbook transcription
```

Against the real project, create the first admin once through the Firebase
Console (console writes bypass rules). The exact steps are documented at the top
of `scripts/bootstrap-admin.mts`.

The desk PIN starts as `1234` until a staff member sets their own.

## Auth model

Staff sign in with a real Firebase Auth account created by an admin. The 4-digit
PIN is a **fast re-unlock** over that authenticated session, not the credential
itself: a 4-digit secret has 10 000 possibilities and the web config is public,
so a PIN alone could never be the security boundary. Rules gate every read and
write on an active `staff/{uid}` record.

## Layout

```
app/
  page.tsx              login: frozen brand panel + PIN numpad
  (app)/                authenticated shell
    dashboard/          takings, check-ins, expiring subscriptions
    kunlik/             the daily tracking sheet
components/
  app/                  shell, sidebar, topbar, dialogs
  grid/                 cell navigation + editable money cells
  ui/                   owned primitives
lib/
  auth/                 auth context, PIN hashing
  db/                   Firestore types, converters, queries, mutations
  domain/               pricing, subscriptions, stock (pure, unit tested)
```

`lib/domain` is deliberately free of Firestore imports so the money rules can be
tested without a database. `npm test` covers discount types, debt derivation,
signed stock deltas, derived subscription status at date boundaries, and freeze
extending the end date.

## Conventions

- Money is an integer count of so'm. Never a float.
- Calendar dates are `"YYYY-MM-DD"` strings in Asia/Tashkent. Instants are
  Firestore Timestamps.
- Stock changes only by appending a signed movement, never by assigning to
  `product.qty`.
- Subscription `expired` / `expiring` are derived from dates, never stored.
- Debt is derived as `finalPrice - sum(payments)`, never stored.
- Icons are Phosphor. The one exception is `components/app/brand-panel.tsx`,
  which is frozen and uses Lucide to stay pixel-identical to the v1 landing.
- No em-dashes in user-facing copy. `brand-panel.tsx` is the sole exception and
  is documented as such in the file.

## Domain rules ported from v1

The Postgres schema and route logic in the earlier `gym/server` project are the
reference for behaviour. Specifically preserved:

- Tariff terms are snapshotted onto a subscription at sale time, so editing a
  tariff never rewrites a past sale.
- `computeFinalPrice` matches v1's `computeFinal()` exactly, including that
  `percent` rounds the discounted total rather than the discount.
- A freeze extends `endDate` by the frozen day count.
- Every financial mutation appends to `audit_log`, which is append-only for
  everyone including admins.
