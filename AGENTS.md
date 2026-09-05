# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

A personal expense tracker: two front ends (mobile webview, desktop dashboard)
sharing one Firebase backend and one package of business logic. It's a port of
a Codex Design prototype (`Expense Dashboard Prototype.dc.html`).

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

That does **not** mean behaviour can't be verified. `shared` is plain ESM with
no DOM dependency, so the working pattern is to build it and drive it from
Node against the seed source:

```bash
pnpm build:shared
node -e "import('./packages/shared/dist/index.js').then(async ({ExpenseStore}) => {
  const s = new ExpenseStore(); await s.init(undefined);
  await new Promise(r => setTimeout(r, 20));       // let the subscription land
  console.log(s.getSnapshot().status, s.getSnapshot().categories.length);
})"
```

This is how the store's generation guard and the realtime subscriptions were
verified. Two habits matter: `await` a short timer before asserting, because
the month arrives by subscription rather than from `init`'s promise; and pair
every test with a control that fails for the opposite reason — a guard that
drops *everything* passes a "stale data was discarded" check just as happily
as a correct one.

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
    queries, `createTransaction`, `createTransactionSeries`, `updateTransaction`),
    plus the `watch*` counterparts built on `onSnapshot`. Each watcher mirrors
    the `fetch*` of the same name and shares its mapper, so a live subscriber
    and a one-shot caller can't disagree about the same data.
  - `src/lib/derive.ts` — **all** derived values (Budget Left, Expense Per
    Bulan, category totals, envelope fill, donut shares, pace, yearly
    rollups, `totalIncome`/`incomeShares`, and `evaluateAlerts`) as pure
    functions over `(transactions, categories, budget)`. No rollup documents
    exist anywhere in Firestore.
  - `src/lib/dates.ts`, `format.ts`, `forms.ts` — date helpers (leap-year
    correct), IDR-first money formatting, framework-free form validation.
  - `src/store.ts` — `ExpenseStore`: framework-agnostic app state exposing
    `subscribe`/`getSnapshot` for `useSyncExternalStore`. React stays out of
    this package entirely.
  - `src/data/` — `ExpenseDataSource` interface with two implementations:
    Firestore (`firestoreSource.ts`) and in-memory seed (`seedSource.ts`).
    `watchMonth` is the **only** read on it; the one-shot `list*`/`get*`
    methods were removed once every view rendered from the pushed snapshot,
    rather than being maintained in three places with nothing calling them.
    `queries.fetch*` is still exported for a genuinely one-off read.
  - `src/data/defaultCategories.ts` — the spreadsheet's category set, plus
    `normalizeCategoryName`, the single way category names are compared
    anywhere (trim + lowercase). Three call sites once disagreed about
    trimming, which let `" Groceries"` take the canonical colour while the
    seeding dedupe missed it and created a second one. Also
    `nextCategoryOrder` — always use it to assign `order`, never
    `categories.length`, which collides after a delete (see below) — and
    `collidingCategoryOrders`, the invariant check `addDefaultCategories`
    runs before its bulk write.
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
Transaction { id, categoryId, paymentMethod?, item, amount, date, yearMonth, year, note?, seriesId, createdAt }
PaymentMethod 'credit_card' | 'bank_transfer' | 'e_wallet' | 'cash' | 'other'
Budget      { id, income, incomes: Income[], categoryBudgets: { [categoryId]: number } }
Income      { id, name, amount, note? }          // amount is per month
Profile     { displayName, currency, locale, alerts: AlertSettings }
AlertSettings { enabled, monthlyLimit, warnPct: 70|80|90, categoryLimits: { [name]: number } }
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

`VITE_FIREBASE_*` values are intentionally inlined into the client bundle —
that's public identification, not a secret; access control lives entirely in
the rules file, not in hiding config.

`ExpenseStore` guards loads with a generation counter: `reset()` bumps it, and
any awaited read that finds the counter changed drops its result rather than
calling `set`. Without it a slow read for the previous account can land after a
new one has signed in — rendering one user's rows under another's uid, where an
edit would write to the wrong collection.

### The month is a subscription, not a read

The app is live. `ExpenseDataSource.watchMonth(yearMonth, …)` returns
an unsubscribe, and `store.reload()` re-points that subscription rather than
re-reading — writes from another tab, another device or the other app repaint
on their own. `mutate()` therefore does **not** reload after a write; the
subscription delivers it, and Firestore's latency compensation usually paints
it before the promise resolves.

Two things matter when touching this:

- **The generation guard covers listeners too.** A listener outliving its
  account is worse than a stale read — it keeps firing. Every callback checks
  the generation before calling `set`, and `reset()` both bumps the generation
  and unsubscribes. `watchCurrentMonth` tears down the previous subscription
  before opening a new one, so a month switch never leaves two running.
- **The Firestore implementation gates its first emit.** It fans out to five
  listeners and stays silent until all five have reported, so the first paint
  is a whole month rather than five partial repaints. After that, every change
  emits immediately. The first error tears the whole fan-out down — a partial
  month is worse than a visible failure.

The seed source is genuinely reactive too: it keeps a watcher registry and
re-emits after every write, so demo mode behaves like the live path instead of
going stale after the first paint.

**All three tabs are live, not just Monthly.** No view calls the data source
directly — Daily renders from `state.monthTransactions` (the day rows are
filtered client-side) and Yearly from `state.yearTransactions`, both of which
`watchMonth` carries in its snapshot. So the subscription repaints every tab.
The one-shot `listTransactionsByDate` / `listTransactionsByYear` remain on
`ExpenseDataSource` but no app code calls them.

The subscription is keyed to the month in view, so Yearly is live for the year
*containing* that month; moving months re-subscribes and `YearlyView` derives
its `year` from `state.yearMonth`, so the two never disagree.

### The category template — one source, three consumers

`src/data/defaultCategories.ts` holds `DEFAULT_CATEGORIES`, the category set
from the source spreadsheet ("Alokasi Keuangan", Monthly Logs tab) in sheet
order with its per-category allocations. Three things read it, so a change
there moves all of them at once:

- `seedData.ts` builds the demo dataset from it,
- `ExpenseStore.addDefaultCategories` writes it into a live account,
- `colorForName` treats its `color` field as the canonical palette.

**Category colour is resolved from the name, not read from the document.**
`colorForName(name, order)` is applied wherever a category is read
(`toCategory`, `seedCategories`), and the stored `color` field is deliberately
ignored. That is what lets an account created before the current palette pick
it up with no migration. The field is still *written* on create, as the escape
hatch for the day a colour picker lands — at which point this has to invert and
consult the stored value first. Until then, changing `color` in Firestore has
no visible effect, which is worth knowing before debugging why it "won't
save". Matching is by name because ids are Firestore-assigned on the live
path; only the name is stable between the template and an account.

A name outside the template falls back to `colorForOrder(order)`, so **`order`
must be unique** — assign it with `nextCategoryOrder` (one past the highest in
use), never `categories.length`. With A(0) B(1) C(2), deleting B leaves length
2, so the next category also takes 2: two categories sharing a ramp slot, and
a tie under `orderBy('order')`.

Deleting deliberately does **not** renumber the survivors. That would keep
`order` dense, but since colour derives from it, every remaining category
would change colour whenever one was deleted. Gaps are harmless — `order` is a
sort key, not an index.

`addDefaultCategories` — the only bulk write — checks the invariant with
`collidingCategoryOrders` and **reports** rather than repairs, appending the
warning to whichever toast it ends on. There is deliberately no migration:
since `nextCategoryOrder` landed, nothing can produce a collision, so a hit
means documents written before it, and silently rewriting `order` would
recolour those categories without being asked. As of the last check the live
account has 11 categories with unique orders 0–10, so this has never fired.

### Category and payment method are independent axes

`categoryId` = **what** the expense is for. `paymentMethod` = **how** it was
paid. Nothing derives one from the other, anywhere.

The field exists because the two were being conflated: card-paid subscriptions
(Codex Pro, YouTube/Gemini) were landing in **Bills** because of the card,
when by nature they are **Subscription**. Any category can be paid by any
method.

What enforces the separation, and what to keep true when touching this:

- `derive.ts` knows nothing about `paymentMethod` — not category totals,
  envelope fill, donut shares, pace, the yearly rollups, or `evaluateAlerts`.
  That is where conflation would creep in, so it stays out by design.
- `denormalize` (`lib/queries.ts`) and its seed twin `build`
  (`data/seedSource.ts`) both enumerate fields explicitly rather than
  spreading, and pass the two through without either consulting the other.
  **They must be edited together** or a new field silently vanishes in seed
  mode only.
- The add/edit form in both apps renders a `<select>` in its own field block,
  never a second chip row — a chip row next to the category chips would read as
  a nested or derived control. Options are never filtered by the picked
  category. On desktop it sits *outside* `.dash__formrow`, whose children are
  positioned by `nth-child` at the mobile fold.

`queries.fetchTransactionsByPaymentMethod(db, userId, method, yearMonth?)` is
the reconciliation read — "everything paid by credit card this month", to check
against a card statement, independent of any category total. Like the other
`fetch*`s it is a one-off read with no `watch*` twin and no `ExpenseDataSource`
method, since `watchMonth` is deliberately the only read on that interface. It
needs the `paymentMethod, date` and `yearMonth, paymentMethod, date` composite
indexes.

`paymentMethod` is **optional and omitted when unset** — deliberately the
opposite of `seriesId` below. It follows the `note` pattern: attached only when
present, never stored as `""`, and a stored value outside the union reads as
unset rather than becoming a typed one. Equality queries are what it exists
for and they work; the accepted trade is that `!=`/`not-in` and "everything
unset" match no document that omits the field — including every row written
before it existed, which is what makes the change need no migration. Because
of that, clearing the field on an edit has to go through `deleteField()`:
`updateTransaction` treats a patch carrying the key with no value as "unset"
and a patch omitting the key as "leave alone". Writing `undefined` would throw.

That contract is why `addExpense` and `updateExpense` are deliberately
asymmetric: the create spreads the field in conditionally (nothing to unset on
a new document), the update always sends the key. `evaluateExpenseForm`
therefore emits `paymentMethod: values.paymentMethod || undefined` on every
draft. Don't "simplify" `addExpense` into spreading the draft straight through
— creates would start writing `paymentMethod: undefined`, which Firestore
rejects.

Series identity is `seriesId` + `date` and nothing else, so changing or
clearing a method never affects what "this and future months" matches.

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

- **Income**: a *list* of sources on `budgets/{yearMonth}.incomes`, edited on
  the Income **page** — its own view in both apps (`desktop/views/IncomeView`,
  `mobile-webview/components/IncomeTab`), not a block on the Monthly/Month tab.
  Desktop reaches it from the toolbar's Income button, which is `tab: 'income'`
  rather than a modal and so is deliberately absent from `SPEND_TABS`, the
  segmented control's list; mobile gives it a fourth nav tab beside Today /
  Month / Year. Add, edit and delete all write the whole array through
  `setIncomes`, since a merge replaces an array rather than merging it
  element-wise. Editing itself is a modal/sheet (`IncomeModal` /
  `IncomeSheet`), not inline fields — a source carries six fields, and six
  always-live inputs per row read as a form.
- **Allocations**: per-category field in desktop Categories modal, or the
  allocation input when creating a category on mobile. Writes to
  `budgets/{yearMonth}.categoryBudgets[categoryId]`.

`Income.amount` is **per payment, not per month**, and a source carries
`cadence` (`monthly` | `quarterly` | `one_off`), `kind` (`fixed` | `variable`,
a reporting axis only), `day` (1-`MAX_INCOME_DAY`, 28 — so a pay day survives
February), `received` and `paused`. `derive.monthlyAmount` is the *only* place
cadence becomes money: quarterly counts for a rounded third each month,
everything else in full.

Everything that spends income reads `derive.totalIncome(budget)` — Budget
Left, spent %, envelope bars, the recurring share, the yearly reference line
and `pace` all go through `monthSummary`, so there is one definition of "the
month's income". It sums `monthlyAmount` over the **non-paused** sources:
pausing therefore moves Budget Left, which is the point — a paused source is
money that is not coming. Until income is set, the Budget Left card shows raw
spend rather than a share of zero, and every percentage renders `—` rather
than NaN.

The panel's other figures — composition segments and their rank-ordered colour
ramp, the fixed/variable/paused split, received, the status pill, "Expected
next" — are all `derive.ts` too (`incomeBreakdown`, `incomeStatus`,
`upcomingIncome`), so the two apps only lay them out. Source colour is
resolved from **rank among active sources**, biggest first: unlike a category,
a source has no identity outside the month's list, so bar, legend and row
agree with no stored field to keep in step.

`queries.toIncome` defaults a document that predates these fields to
`monthly` / `fixed` / day 1 / not received / **not paused** — chosen so a
legacy month reads back with exactly the income it had. A `quarterly` or
`paused` default would silently divide or erase a live account's income. Same
narrowing rule as `paymentMethod`: a stored value outside the union reads as
the default rather than becoming a typed one.

"Expected next" is scoped to the month *in view*. Nothing stored says which
months a quarterly source actually pays — only how big the cheque is — so
projecting a payment into a future month would be a guess; a source is
expected in the month you are looking at until you mark it received there.

**A month always keeps at least one source.** `ExpenseStore.deleteIncome`
refuses the last one and the views stop offering a Remove button for it — the
rule is in the store because two tabs can each still be showing two sources.
Remove sits on the row on desktop and inside the edit sheet on mobile, where a
destructive third button a thumb-width from Pause would be the wrong place.

`budgets/{yearMonth}.income`, the old single number, is still **read** as a
fallback: `queries.resolveIncomes` synthesises a one-source list from it when
a document has no `incomes` array, so an account written before this change
keeps its income with no migration. Nothing writes it any more. This is the
same trick `colorForName` plays with the palette.

### Spending alerts

Settings live on `profile/main.alerts` — one set per account, already carried
by the profile arm of the `watchMonth` fan-out, so they need no new listener.
They are *evaluated* against whichever month is in view, by
`derive.evaluateAlerts`, which both apps render as banners above the
dashboard on every tab.

Two rules, applied to the monthly cap and to each per-category cap alike:
over the limit is a breach, at or past `warnPct` of it is a warning. A limit
of 0 is unset and evaluates to nothing — an unset cap is silent, not
permanently breached. A breach takes the dark ink surface, a warning the pale
accent; no colour is introduced beyond the existing tokens.

`categoryLimits` is keyed by **category name**, not id — the alert copy reads
the key back out ("Groceries is over its limit"). Keys are canonicalised to
the category's own `name` on write and compared with `normalizeCategoryName`
on read, so one category can never hold two caps under two spellings. A key
whose category was renamed or deleted keeps its settings row, so it can be
cleared, but matches no spend and never fires.

Note the month *name* in alert copy is en-US ("for August"), matching
`monthLabel` in the month nav, while the amounts in the same sentence are
formatted in the profile's locale. Passing the money locale through would put
"for Agustus" under a header reading "August 2026".

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
