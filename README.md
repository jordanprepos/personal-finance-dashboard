# expense-tracker

A personal expense tracker with two front ends — a mobile webview and a desktop
dashboard — sharing one Firebase backend and one package of business logic.

The UI implements the Claude Design prototype
[`Expense Dashboard Prototype.dc.html`](https://claude.ai/design/p/21aceca5-bde0-48a3-8290-d22e161276bc?file=Expense+Dashboard+Prototype.dc.html):
its desktop layout is `packages/desktop`, its phone layout is
`packages/mobile-webview`.

```
expense-tracker/
├── packages/
│   ├── shared/              # Firebase config, TS types, business logic, utils
│   ├── mobile-webview/      # Mobile-facing web app
│   └── desktop/             # Desktop dashboard app
├── firebase/
│   ├── firestore.rules
│   └── firestore.indexes.json
├── package.json             # workspace root
├── pnpm-workspace.yaml
├── .env.example             # Firebase config keys — .env is gitignored
└── README.md
```

## Getting started

```bash
pnpm install
pnpm build          # builds shared first, then both apps
pnpm dev:desktop    # http://localhost:5173
pnpm dev:mobile     # http://localhost:5174
```

Both apps run immediately with no Firebase project: with no config in the
environment they fall back to an in-memory seed dataset (see
`packages/shared/src/data/seedData.ts`) and say so in the header.

## Firebase setup

1. Copy the template and fill it in from **Firebase console → Project settings
   → Your apps → SDK setup and configuration**:

   ```bash
   cp .env.example .env
   ```

   One `.env` at the workspace root serves both apps — each `vite.config.ts`
   sets `envDir: '../..'`.

2. Enable **Email/Password** (and optionally **Google**) under Authentication →
   Sign-in method. Both apps open on a login screen; every identity is a real
   account, so `request.auth.uid` is populated and the security rules apply.
   There is no anonymous sign-in — it was removed once the login gate landed,
   because signing in automatically means the gate never renders.

   Add `localhost` under Authentication → Settings → Authorized domains, or
   Google Sign-in's popup is refused in local development. (Email/Password is
   unaffected; it doesn't use OAuth redirects.)

3. Create the Firestore database **from the Firebase console** — Firestore →
   Create database — with database ID `personal-finance-dashboard-db` and
   location `asia-southeast2`. Not `(default)`, which lands in `nam5` (US), and
   not via the CLI or the Firebase MCP tools: a database created through the
   API silently refused to enforce the rules released to it, failing every
   authenticated request with `PERMISSION_DENIED`. See CLAUDE.md for the full
   symptom.

4. Deploy the rules and indexes:

   ```bash
   npx firebase-tools deploy --only firestore:rules,firestore:indexes
   ```

   The target database comes from `firebase.json`; `deploy` has no
   `--database` flag.

The `VITE_FIREBASE_*` values are inlined into the client bundle by design.
Firebase web config is public identification, not a secret — access control is
enforced entirely by `firebase/firestore.rules`. `.env` is gitignored;
`.env.example` holds placeholders only.

## Data model

```
users/{userId}
  ├── categories/{categoryId}
  ├── transactions/{transactionId}
  ├── budgets/{yearMonth}        // doc id "2026-08"
  └── profile/main               // single doc
```

`profile` is a single document at `users/{userId}/profile/main`. Firestore
paths alternate collection/document, so a bare `profile` segment is not a legal
document path; `main` keeps it under `users/{userId}` where the rule applies.

The interfaces live in [`packages/shared/src/types.ts`](packages/shared/src/types.ts)
and are the contract dashboard queries are written against.

```ts
Category    { id, name, type: 'fixed'|'variable'|'savings', color, icon, order, archived }
Transaction { id, categoryId, item, amount, date, yearMonth, year, note?, seriesId, createdAt }
Budget      { id, income, categoryBudgets: { [categoryId]: number } }
```

`amount` is in the smallest currency unit — for IDR that means no decimals.

### Recurring entries — `seriesId`

A repeating charge is written as one independent document per month (which is
what keeps rollups to equality queries), and every document in that run carries
the same `seriesId`. Nothing is inferred from the item name.

`seriesId` is **`string | null`, always written** — one-off entries store an
explicit `null` rather than omitting the field. A document that is *missing* a
field matches no filter on it in Firestore, not even `!=` or `not-in`, so
omitting it would make "recurring" queryable and "one-off" not. Written this
way, both directions work:

```ts
where('seriesId', '==', seriesId)                          // one whole run
where('seriesId', '==', seriesId), where('date', '>=', d)  // this + future months
where('seriesId', '!=', null)                              // all recurring spend
where('seriesId', '==', null)                              // all one-off spend
```

The id is issued by `createTransactionSeries` (a fresh Firestore document id)
and never edited afterwards — it is excluded from `TransactionInput` and
`TransactionPatch` alongside the denormalized fields, so a caller cannot invent
one or move an entry between runs. Editing a series member changes only that
month's entry.

Backfilling history from a spreadsheet? Rows written with `createTransaction`
get `seriesId: null` and read as one-offs. Repeating charges have to go in
through `createTransactionSeries` to appear in the recurring panel.

### Denormalization

`yearMonth` ("YYYY-MM") and `year` ("YYYY") are computed **from `date` on every
write**, never derived at query time, so daily / monthly / yearly rollups are
equality queries rather than range scans:

```ts
where('date', '==', '2026-08-26')   // daily
where('yearMonth', '==', '2026-08') // monthly
where('year', '==', '2026')         // yearly
```

The type system enforces it: `TransactionInput` is
`Omit<Transaction, 'id' | 'yearMonth' | 'year' | 'seriesId' | 'createdAt'>`, so
a caller *cannot* pass those fields. `createTransaction`, `createTransactionSeries` and
`updateTransaction` in
[`packages/shared/src/lib/queries.ts`](packages/shared/src/lib/queries.ts) set
them; changing `date` in a patch re-derives both in the same write.

### Derived values

**Budget Left**, **Expense Per Bulan**, category totals, envelope fill, donut
shares, pace and the yearly rollups are **not stored fields**. They are pure
functions over `(transactions, categories, budget)` in
[`packages/shared/src/lib/derive.ts`](packages/shared/src/lib/derive.ts), used
by both apps. No rollup documents exist and no `total` field is written
anywhere.

## Packages

### `packages/shared`

| Path | What it holds |
| --- | --- |
| `src/types.ts` | The Firestore schema as TypeScript interfaces |
| `src/firebase.ts` | Config read from env vars, app/auth/Firestore init |
| `src/lib/queries.ts` | Daily / monthly / yearly queries and every write path |
| `src/lib/derive.ts` | All derived values — totals, envelopes, donut, pace, year bars |
| `src/lib/dates.ts` | `YYYY-MM-DD` / `YYYY-MM` helpers, leap-year-correct month lengths |
| `src/lib/format.ts` | IDR-first money formatting |
| `src/lib/forms.ts` | Framework-free validation for the add/edit forms |
| `src/store.ts` | `ExpenseStore` — app state, framework-agnostic |
| `src/data/` | `ExpenseDataSource` with a Firestore and an in-memory seed implementation |
| `src/styles/tokens.css` | Design tokens and component classes from the design project |

`ExpenseStore` exposes `subscribe` / `getSnapshot`, so React binds to it with
`useSyncExternalStore` and React stays out of this package. Both apps drive the
same store and differ only in how they render its snapshot.

### `packages/desktop` and `packages/mobile-webview`

React 19 + Vite + TypeScript. Both depend on `@expense-tracker/shared` as a
workspace package (`"@expense-tracker/shared": "workspace:*"`), which pnpm
builds first. Neither app contains business logic or Firestore calls — they
import view models from `shared` and render them.

## Income and allocations

`Budget` is data, not a constant — nothing is seeded on a fresh project, so both
apps can write it:

* **Income** — a list of sources (`{ id, name, amount, note? }`, amount per
  month) on `budgets/{yearMonth}.incomes`, edited in the Income panel on the
  desktop Monthly tab and the mobile Month tab. Each source shows its share of
  the total, and a month always keeps at least one.
* **Allocations** — the per-category field in the desktop Categories modal, and
  the allocation input when creating a category on mobile. Writes to
  `budgets/{yearMonth}.categoryBudgets[categoryId]`.

Everything downstream of income — Budget Left, spent %, envelope bars, the
recurring share, the yearly reference line, pace — reads `totalIncome`, the sum
of the sources. Until an income is set, the Budget Left card shows spend for the
month and says so, and percentages render `—` rather than a share of zero.

An account written before income became a list keeps working: a lone
`budgets/{yearMonth}.income` number is read as a single source, with no
migration.

## Spending alerts

Per-account settings on `profile/main.alerts` — an on/off switch, a monthly
limit, a 70/80/90% warning threshold, and per-category limits — evaluated
against the month in view and rendered as banners above the dashboard on every
tab. Over the limit is a breach (dark ink surface), at or past the threshold is
a warning (pale accent). A limit of 0 is unset and evaluates to nothing.

## Status

The seed path is exercised end to end — derived values, writes, recurring
detection, series expansion and clamping, and the zero-budget state.

The Firestore path now runs against the live `personal-web-app-projects`
project. Email/Password sign-in works end to end from the login screens in both
apps and the dashboards render live data. Google Sign-in is wired but uses
`signInWithPopup`, which a real native webview commonly blocks — fine in a
desktop browser, and it would need the redirect flow to be reliable inside the
mobile webview. "Forgot password?" is inert by design;
`sendPasswordResetEmail` is not wired up in `shared`.

Deploy the indexes before first use — the series delete (`seriesId ASC,
date ASC`) is the query a missing composite index surfaces first.

The dashboard is live: it subscribes rather than re-reading, so a write in
one tab or app repaints the other. Daily and Yearly are live too — every view
renders from the same subscribed state rather than fetching for itself.

## Notes on the port

* **Recurring entries.** The prototype's `recurring: boolean` becomes
  `seriesId: string | null`, always written — see
  [Recurring entries](#recurring-entries--seriesid).
  This is the one addition to the schema you specified, and it was made at your
  request. It reproduces the prototype's behaviour exactly: only the five
  monthly charges are flagged, and Token Listrik and Gojek read as the one-offs
  they were. The read converter normalises a legacy document written without
  the field to `null`, so pre-existing rows still deserialise — but they will
  not match a `== null` query until the field is backfilled.
* **Category allocations** live on `budgets/{yearMonth}.categoryBudgets`, not
  on the category document, so an allocation can change month to month.
* **Category identity** is `categoryId` everywhere. The prototype matched
  categories by display name.
* **Month lengths** are computed from the date rather than from a hardcoded
  `[31,28,…]` table, so 2028 is correct.
* The mobile Month and Year tabs render envelope and per-month summaries; in
  the prototype those bottom-nav items only changed the highlight colour.
