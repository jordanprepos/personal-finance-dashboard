# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal expense tracker: two front ends (mobile webview, desktop dashboard)
sharing one Firebase backend and one package of business logic. It's a port of
a Claude Design prototype (`Expense Dashboard Prototype.dc.html`).

## Commands

```bash
pnpm install
pnpm build          # builds shared first, then both apps (pnpm -r respects the workspace dep graph)
pnpm build:shared   # build just packages/shared
pnpm typecheck       # tsc --noEmit across all packages
pnpm dev:desktop     # http://localhost:5173
pnpm dev:mobile      # http://localhost:5174
pnpm clean
```

There is no lint script and no test suite/framework configured in this repo —
don't invent `pnpm lint` or `pnpm test` commands. `pnpm typecheck` (or a
package-scoped `pnpm --filter @expense-tracker/<pkg> typecheck`) is the
correctness check available.

Absent env config, both apps fall back to an in-memory seed dataset
(`packages/shared/src/data/seedData.ts`) and say so in the header. To point at
real Firebase, `cp .env.example .env` at the workspace root (both
`vite.config.ts` files set `envDir: '../..'`) and fill in `VITE_FIREBASE_*`
from the Firebase console — this repo already has a live project wired up
(`personal-web-app-projects`, active alias in `.firebaserc`), so `.env` is
normally just the config for the existing web app, not a fresh setup.

Firestore lives in a **named database, `personal-finance-dashboard-db`, in
`asia-southeast2`** — not `(default)`. `personal-web-app-projects`'s `(default)`
slot lands in `nam5` (US), so `packages/shared/src/firebase.ts` calls
`getFirestore(app, 'personal-finance-dashboard-db')` explicitly and
`firebase.json`'s `firestore[].database` field points deploys at the same
database. Deploy rules/indexes with

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

before first use against a live project — the target database comes from
`firebase.json`; there is **no** `--database` flag on `deploy` (firebase-tools
rejects it). The series delete query (`seriesId ASC, date ASC`) is the first
thing that surfaces a missing composite index.

**This database must be created from the Firebase console**, not via the CLI or
the Firebase MCP tools. A predecessor named `expense-tracker`, created through
the API, silently refused to enforce the security rules released to it: every
authenticated client request failed with `PERMISSION_DENIED` ("Missing or
insufficient permissions") even though the correct ruleset was provably
released to `cloud.firestore/expense-tracker` and bound via `attachmentPoint`.
A control test on a console-created database, using the identical ruleset and
token, allowed the same reads — so if that error reappears across the board,
suspect the database, not the rules.

## Architecture

Workspace layout (pnpm workspaces, `packages/*`):

- **`packages/shared`** (`@expense-tracker/shared`) — all business logic and
  Firestore access. Neither app contains business logic or Firestore calls;
  they import view models from `shared` and render them.
  - `src/types.ts` — the Firestore schema as TS interfaces; the contract every
    query is written against.
  - `src/firebase.ts` — config from env vars, app/auth/Firestore init.
  - `src/lib/queries.ts` — every read/write path (daily/monthly/yearly
    queries, `createTransaction`, `createTransactionSeries`, `updateTransaction`).
  - `src/lib/derive.ts` — **all** derived values (Budget Left, Expense Per
    Bulan, category totals, envelope fill, donut shares, pace, yearly
    rollups) as pure functions over `(transactions, categories, budget)`. No
    rollup documents exist anywhere in Firestore.
  - `src/lib/dates.ts`, `format.ts`, `forms.ts` — date helpers (leap-year
    correct), IDR-first money formatting, framework-free form validation.
  - `src/store.ts` — `ExpenseStore`: framework-agnostic app state exposing
    `subscribe`/`getSnapshot` for `useSyncExternalStore`. React stays out of
    this package entirely.
  - `src/data/` — `ExpenseDataSource` interface with two implementations:
    Firestore (`firestoreSource.ts`) and in-memory seed (`seedSource.ts`).
  - `src/styles/tokens.css` — design tokens/component classes from the design
    prototype.
- **`packages/desktop`** and **`packages/mobile-webview`** — React 19 + Vite +
  TS. Both depend on `@expense-tracker/shared` via `workspace:*`, which pnpm
  builds first. Pure view layers driven by the same `ExpenseStore`.

### Firestore data model

```
users/{userId}
  ├── categories/{categoryId}
  ├── transactions/{transactionId}
  ├── budgets/{yearMonth}        // doc id "2026-08"
  └── profile/main               // single doc — "profile" alone isn't a legal doc path
```

```ts
Category    { id, name, type: 'fixed'|'variable'|'savings', color, icon, order, archived }
Transaction { id, categoryId, item, amount, date, yearMonth, year, note?, seriesId, createdAt }
Budget      { id, income, categoryBudgets: { [categoryId]: number } }
```

`amount` is in the smallest currency unit (IDR has no decimals).

Both apps gate on a login screen. `AuthController`
(`packages/shared/src/auth.ts`) owns the session — `subscribe`/`getSnapshot`
like `ExpenseStore`, so the views bind to it the same way — and wraps
`signUpWithEmail`, `signInWithEmail`, `signInWithGoogle` and `signOutUser`
from `data/index.ts`. Email/Password and Google Sign-in are enabled on the live
project (deployed via `firebase deploy --only auth`, configured under the
`auth` key in `firebase.json`).

Authentication is deliberately **not** done inside `resolveSession`: it takes
an already-resolved `userId`, so a signed-out state exists for the login
screens to render. There is **no anonymous sign-in path** — it was removed
once the login gate landed, because signing in automatically means the gate
never renders. Every identity is a real account. With no Firebase config there
is nothing to sign in to, so `AuthController` reports `status: 'unavailable'`
and the apps skip the gate and run on seed data as before.

`ExpenseStore` guards loads with a generation counter: `reset()` bumps it, and
any awaited read that finds the counter changed drops its result rather than
calling `set`. Without it a slow read for the previous account can land after a
new one has signed in — rendering one user's rows under another's uid, where an
edit would write to the wrong collection.
`VITE_FIREBASE_*` values are intentionally inlined into the client bundle —
that's public identification, not a secret; access control lives entirely in
the rules file, not in hiding config.

### Recurring entries — `seriesId`

A repeating charge is one independent Firestore document per month (keeps
rollups to equality queries); every document in a run shares the same
`seriesId`. Nothing is inferred from the item name.

`seriesId` is **`string | null`, always written** — one-off entries store an
explicit `null` rather than omitting the field, because a Firestore document
missing a field matches *no* filter on it (not even `!=`/`not-in`). This is
what makes both directions queryable:

```ts
where('seriesId', '==', seriesId)                           // one whole run
where('seriesId', '==', seriesId), where('date', '>=', d)   // this + future months
where('seriesId', '!=', null)                                // all recurring spend
where('seriesId', '==', null)                                 // all one-off spend
```

The id is issued once by `createTransactionSeries` and never edited after —
it's excluded from `TransactionInput`/`TransactionPatch` so callers can't
invent one or move an entry between runs. Editing a series member changes only
that month's entry. Rows written via plain `createTransaction` (e.g. spreadsheet
backfill) get `seriesId: null` and read as one-offs; only
`createTransactionSeries` produces entries that show in the recurring panel.

### Denormalization

`yearMonth` ("YYYY-MM") and `year` ("YYYY") are computed **from `date` on every
write**, never at query time — daily/monthly/yearly rollups are equality
queries, not range scans. `TransactionInput` is
`Omit<Transaction, 'id' | 'yearMonth' | 'year' | 'seriesId' | 'createdAt'>`, so
the type system prevents a caller from passing those fields directly;
`createTransaction`/`createTransactionSeries`/`updateTransaction` in
`packages/shared/src/lib/queries.ts` derive them (changing `date` in a patch
re-derives both).

### Income and allocations

`Budget` is data, not a constant — nothing is seeded on a fresh project.

- **Income**: Income card on desktop Monthly tab / top of mobile Month tab.
  Commits on blur/Enter to `budgets/{yearMonth}.income`.
- **Allocations**: per-category field in desktop Categories modal, or the
  allocation input when creating a category on mobile. Writes to
  `budgets/{yearMonth}.categoryBudgets[categoryId]`.

Until income is set, the Budget Left card shows raw spend for the month rather
than a share of zero.

## Notable porting decisions (vs. the original prototype)

- The prototype's `recurring: boolean` became `seriesId: string | null` (see above)
  — the one schema addition beyond the original spec, made at the user's
  request; it reproduces the prototype's exact behavior for the seed data's
  five monthly charges.
- Category allocations live on `budgets/{yearMonth}.categoryBudgets`, not on
  the category document, so an allocation can change month to month.
- Category identity is `categoryId` everywhere; the prototype matched by
  display name.
- Month lengths are computed from the date, not a hardcoded table.
- The Firestore path (`lib/queries.ts`, `data/firestoreSource.ts`) is now wired
  against the live `personal-web-app-projects` project — Auth (Email/Password,
  Google Sign-in) and Firestore (named database
  `personal-finance-dashboard-db`, `asia-southeast2`) are both live and
  rules/indexes are deployed. Email/Password sign-in is exercised end to end from the login
  screens in both apps; Google Sign-in is wired but uses `signInWithPopup`,
  which a real native webview commonly blocks — it works in a desktop browser
  and would need the redirect flow to be reliable inside the mobile webview.
  "Forgot password?" is inert, matching the design — `sendPasswordResetEmail`
  is not wired up in `shared`.
