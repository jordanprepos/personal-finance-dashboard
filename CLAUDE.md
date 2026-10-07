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
    equality queries, the `date`-range read a tracking cycle needs,
    `createTransaction`, `createTransactionSeries`, `updateTransaction`),
    plus the `watch*` counterparts built on `onSnapshot`. Each watcher mirrors
    the `fetch*` of the same name and shares its mapper, so a live subscriber
    and a one-shot caller can't disagree about the same data. One deliberate
    exception: `ExpenseStore` corrects former template spellings on each
    snapshot (`withCurrentCategoryNames`), so `fetchCategories` and
    `fetchProfile` return the stored names and cap keys uncorrected.
    `saveAlerts` relies on that. It calls `fetchProfile` on every alert write
    and diffs the *stored* keys against the resolved map to decide which keys
    to delete.
  - `src/lib/derive.ts` — **all** derived values (Budget Left, Expense Per
    Bulan, category totals, envelope fill, donut shares, pace, yearly
    rollups, `totalIncome`/`incomeShares`, and `evaluateAlerts`) as pure
    functions over `(transactions, categories, budget)`. No rollup documents
    exist anywhere in Firestore.
  - `src/lib/dates.ts`, `format.ts`, `forms.ts` — date helpers (leap-year
    correct) including the salary-cycle arithmetic, IDR-first money formatting,
    framework-free form validation.
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
    anywhere (trim + lowercase, and nothing else). Three call sites once
    disagreed about trimming, which let `" Groceries"` take the canonical
    colour while the seeding dedupe missed it and created a second one. The
    add-category form's duplicate check and the alert-cap pickers were later
    found comparing their own way, and now go through it too.
    **A renamed template entry is corrected at read time**, by
    `resolveFormerNames`. `ExpenseStore` applies it once, through
    `withCurrentCategoryNames`, to each snapshot from whichever data source.
    The template's "Apparell" (the source spreadsheet's typo) became "Apparel"
    in 2026-10, and nothing stored is renamed. An account seeded earlier
    therefore reads its "Apparell" back as "Apparel": canonical colour, no
    second Apparel from "Use my default categories", and an alert cap stored
    under the old key re-keyed to the new one. The correction is skipped while
    the new name is taken, either by one of the account's categories or by one
    this pass already renamed, so two real categories are never merged.
    **Cap keys need care.**
    - **A cap under the new name is kept.** Once the category reads as
      "Apparel", the app writes its cap under "Apparel", and that same write
      deletes the old key. So for a corrected account this is the normal
      state, not an orphan. #28 dropped such caps, which made a legacy
      account's Apparel cap vanish after its next alert write.
    - **When both keys exist, the old-spelling cap wins.** It is the one the
      category was firing on before the correction.

    An earlier attempt folded the spelling inside `normalizeCategoryName`
    itself. That merged such pairs, left the typo on screen, and answered
    prototype names like "constructor" with non-strings, because the lookup
    was an object literal; the table is a `Map` now. Rename a template entry
    only with an entry in `FORMER_NAMES`.

    Also `nextCategoryOrder` — always use it to assign `order`, never
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
  ├── accounts/{accountId}
  ├── categories/{categoryId}
  ├── transactions/{transactionId}
  ├── budgets/{yearMonth}        // doc id "2026-08"
  └── profile/main               // single doc — "profile" alone isn't a legal doc path
```

```ts
Account     { id, name, type: AccountType, balance, balanceAsOf, limit, monthlyPayment, order }
AccountType 'cash' | 'checking' | 'savings' | 'credit_card' | 'investment' | 'other'
Category    { id, name, type: 'fixed'|'variable'|'savings', color, icon, order, archived }
Transaction { id, categoryId, paymentMethod?, accountId?, item, amount, date, yearMonth, year, note?, seriesId, createdAt }
PaymentMethod 'credit_card' | 'bank_transfer' | 'e_wallet' | 'cash' | 'other'
Budget      { id, income, incomes: Income[], categoryBudgets: { [categoryId]: number } }
Income      { id, name, amount, note? }          // amount is per month
Profile     { displayName, currency, locale, alerts: AlertSettings, cycleStartDay, dashboardCards: string[] }
AlertSettings { enabled, monthlyLimit, warnPct: 70|80|90, categoryLimits: { [name]: number } }
```

`amount` is in the smallest currency unit (IDR has no decimals).

`yearMonth` and `year` on a transaction are always the **calendar** month and
year of `date`. They are not the tracking period — see "The tracking period is
a salary cycle" below.

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
- **The Firestore implementation gates its first emit.** It fans out to seven
  listeners and stays silent until all seven have reported, so the first paint
  is a whole month rather than seven partial repaints. After that, every change
  emits immediately. The first error tears the whole fan-out down — a partial
  month is worse than a visible failure.
- **The seventh listener is `hasTransactions`**, a `limit(1)` probe of the
  whole transactions collection (`queries.watchHasTransactions`). It is the
  snapshot's only fact about history beyond the year in view, and exists for
  the getting-started panel — see "First run" below. It is derived, not
  stored: a "has logged an expense" flag on the profile would be a rollup
  document, missed by any write that bypasses the store (spreadsheet backfill
  through plain `createTransaction`) and absent on every existing account. One
  document read per subscription, no index.

The seed source is genuinely reactive too: it keeps a watcher registry and
re-emits after every write, so demo mode behaves like the live path instead of
going stale after the first paint.

**All three tabs are live, not just Monthly.** No view calls the data source
directly — Entries (the `daily` tab) renders from `state.monthTransactions` (the day rows are
filtered client-side) and Yearly from `state.yearTransactions`, both of which
`watchMonth` carries in its snapshot. So the subscription repaints every tab.
The one-shot `listTransactionsByDate` / `listTransactionsByYear` remain on
`ExpenseDataSource` but no app code calls them.

The subscription is keyed to the month in view, so Yearly is live for the year
*containing* that month; moving months re-subscribes and `YearlyView` derives
its `year` from `state.yearMonth`, so the two never disagree.

### The tracking period is a salary cycle, resolved at read time

`profile/main.cycleStartDay` is the day a period opens on. `1` means plain
calendar months and is what a profile written before the field existed reads
back as, so an older account is unchanged. `27` makes 27 Aug – 26 Sep one
period, **labelled by the month it ends in** — `"2026-09"`.

Nothing stored changes. `denormalize` still writes the calendar `yearMonth` and
`year` from `date`, there is no backfill, and moving the start day re-windows
history rather than rewriting it. What changes is the *read*: a period is a
`date` range (`queries.rangeConstraints`, `watchTransactionsInRange`) instead of
an equality query. Ranging over `date`, which is also the sort key, needs only
the automatic single-field index — nothing was added to
`firestore.indexes.json`, and every equality rollup and its composite index is
untouched. `fetchTransactionsByPaymentMethod` deliberately keeps
`yearMonth ==`: it reconciles against a card statement, and statements are
calendar-shaped.

A period id keeps the `"YYYY-MM"` shape, which is what leaves `assertYearMonth`,
`budgets/{yearMonth}` doc ids, `shiftMonth` month nav and `monthLabel` all
working unchanged. So `budgets/2026-09` holds the income and allocations for
27 Aug – 26 Sep.

The arithmetic is in `lib/dates.ts`: `cycleOf`, `cycleRange`, `cycleLength`,
`dayInCycle`, `dateInCycle`, `clampDayInCycle`, `cycleRangeLabel`. Two rules
worth knowing before touching them:

- **`startDay === 1` is an explicit branch in every helper, not a value the
  general formula happens to handle.** End-labelling is discontinuous there —
  the general formula would label calendar August "September". Every helper
  collapses to its calendar-month twin at 1, and *that identity is the control
  the whole feature is tested against*: a cycle implementation that dumps
  everything into one bucket passes a "the 28th moved" check just as happily as
  a correct one.
- **Each day-of-month occurs at most once in a window** (27, 28 … 31, 1, 2 …
  26), which is why the expense form still takes a plain "Day" number rather
  than growing a date picker. `dateInCycle` resolves it, and both clamp sites —
  `forms.evaluateExpenseForm` and `store.addExpense`/`updateExpense` — go
  through it, so a typed number cannot mean two different dates.

**The start day arrives with the profile, which is the awkward part.** The store
picks a period in its constructor, before any Firestore round-trip, so the first
subscription of a session is opened on a guess. `watchCurrentMonth`'s snapshot
handler compares the arriving `profile.cycleStartDay` against the one the
subscription was opened with and re-points when they differ — deliberately
*without* setting `status: 'ready'`, so a cold start holds on `loading` rather
than flashing a calendar month before the cycle replaces it. It converges in one
extra subscribe, because the second subscription uses the start day the first
one reported. `ExpenseStore.pinned`, set by `setYearMonth`, is what stops that
correction yanking someone off a period they navigated to themselves.

The consequences elsewhere are all in `derive.ts`, and all take `cycleStartDay`
defaulting to `1`: `pace` counts elapsed days and period length from the window;
`bucketByMonth` assigns rows by `cycleOf(t.date)` rather than the stored
`yearMonth` (still twelve buckets a year, just cycle-shaped); `expectedIncome`
sorts by position in the window, not by day number, since 27 comes before 3.
`store.addExpense`'s repeat bound is `seriesThroughMonth(lastPeriod, day,
startDay)`: the calendar month *that day* falls in for the run's last period.
Which half of a cycle a day lands in depends on the day — at a 27th start the
28th of period `2027-09` is in August, the 3rd in September — so a single
fixed bound truncates one and overshoots the other. See "Recurring entries"
for how far a run reaches.

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
hatch for the day a colour picker lands — at which point this has to invert
and consult the stored value first, the way `Account.color` already does.
Until then, changing `color` in Firestore has no visible effect, which is
worth knowing before debugging why it "won't save". Matching is by name because ids are Firestore-assigned on the live
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
(Claude Pro, YouTube/Gemini) were landing in **Bills** because of the card,
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

**A run covers twelve periods, and is continued on request.** `SERIES_PERIODS`
(`lib/dates.ts`) periods from the one in view, through `seriesLastPeriod`. It
used to be "every remaining period of the year", which made a run set up in
December a single entry and ended every run on the account together each
January, with nothing on screen to say so.

Continuing one is **Repeat through …** on the edit form of any series member
(`store.extendExpenseSeries`). It is deliberately an action, never automatic,
for the same reason "Copy from last month" is: opening a period must not write
rows. What it writes is `queries.seriesExtension`, which both data sources
call (`extendTransactionSeries`, Firestore and seed twin):

- **Months after the run's last entry only**, through
  `seriesExtendTarget(today, cycleStartDay)` — a full horizon from the period
  containing *today*, not from the entry being edited, so it means "keep this
  going a year from now" whichever month it is pressed from. The button's
  label reads the same helper, so the label and the write agree.
- **Never into the past.** Nothing is written before the period containing
  today: a run that lapsed in December and is extended in March resumes in
  March. January and February went by without it — exactly the months someone
  logs by hand once a charge stops appearing — so backfilling them would
  duplicate those. The toast names where it resumed ("from March 2027"), so a
  skipped stretch is visible.
- **Idempotent.** A run already reaching the target gains nothing, so a second
  press or a second tab writes no duplicates. A month deleted from the middle
  of a run is not refilled — it was deleted on purpose.
- **Same `seriesId`**, which is what lets "this + future months" reach the new
  entries. It takes an existing id and writes nothing for one with no entries,
  so callers still cannot mint a run — the reason `seriesId` stays out of
  `TransactionInput`.
- **Fields from the last entry, day from the first.** The last carries the
  latest edits (editing a member changes only that month); the first carries
  the day the run was set up on, which a short month may have clamped since —
  a run on the 31st continuing from February goes on the 31st/30th, not the
  28th forever. Both calendar bounds (`SeriesExtendWindow` is in periods) are
  derived inside `seriesExtension` from that same first day, so under a cycle
  the window and the dates written into it cannot disagree about which half of
  a period the day lands in. Optional fields are spread conditionally, never
  `undefined`.

It reads the run with `fetchTransactionSeries` (`seriesId ==`, `orderBy date`),
which the existing `seriesId, date` composite index covers. Runs written before
this change end at December of their year; each needs one **Repeat through …**
to continue. Before January is the easy time — afterwards none of their entries
is in the period in view, and since nothing is backfilled, January would be
left to log by hand.

Runs still end **silently**. Twelve-period horizons stagger the ends rather
than stacking them on 1 January, but nothing yet says "this run ends in May";
an "ends …" marker on the Monthly recurring panel, for runs whose last entry
falls inside the year in view, is the obvious follow-up.

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
  segmented control's list; mobile gives it a fifth nav tab beside Home /
  Entries / Month / Year. Add, edit and delete all write the whole array through
  `setIncomes`, since a merge replaces an array rather than merging it
  element-wise. Editing itself is a modal/sheet (`IncomeModal` /
  `IncomeSheet`), not inline fields — a source carries six fields, and six
  always-live inputs per row read as a form.
- **Allocations**: a per-category field in the Categories manager on both
  surfaces — inline beside the name on desktop, on its own line under the name
  in the phone's sheet (at 360px a name, a money field and Delete in one row
  would leave the name little room — estimated, not measured). Both commit on blur/Enter and write
  `budgets/{yearMonth}.categoryBudgets[categoryId]`; an emptied field writes
  0, which "Copy from last month" (below) then leaves alone. The phone sheet
  used to have no such field — allocation was set once, at create — so every
  month after a category's first read "no allocation" with no way to change
  it there. The phone's Month tab links to the sheet ("Set allocations")
  whenever an envelope has no allocation **set** for the month — no key, as
  carry-over reads it, so a category deliberately cleared to 0 does not nag
  every month. That is where the gap is noticed, and Categories sits behind
  Manage.

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
`expectedIncome`), so the two apps only lay them out. Source colour is
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

`derive.expectedIncome` returns the "Expected next" list (`items`), its total
and, when the list is empty, **why**, all from one filter (`pendingIncomes`).
The why is one of three reasons: no sources, every source paused, or
everything landed. Each reason's wording lives once, in `INCOME_EMPTY_LABELS`,
which the income lists also read for their no-sources line. Both apps hide
the Expected next block for "no sources", because the list above already says
it. The desktop Income page, the phone's Income tab
and the Income expected card each branch on that single `empty` value. They
had drifted into three separate tests, two of which said "everything has
landed" when nothing was ever due. The first two reasons come from
`incomeEmptyState`, which the Income composition card uses too. "No sources"
says to add one. "All paused" says to resume one instead, because a month
always keeps at least one (see below). The expected card drops its "Still
expected" footer when the list is empty, rather than reporting Rp 0.

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

**"Copy from last month" is how a plan moves forward — and only on request.**
Income and allocations both live on `budgets/{yearMonth}`, so a new period
opens with neither: Budget Left reads raw spend and every envelope reads "no
allocation set". `store.carryOverBudget` fills them from **earlier periods**
(not just the previous one, so a skipped month does not leave nothing to
copy). It is a button, never automatic: opening a period is navigation, and
copying on open would write a budget document for every month someone
stepped past — the same "nothing seeds itself" rule `addDefaultCategories`
follows.

The rules are `lib/carryOver.ts`'s — `planSourcesBefore` finds, `fillPlanGaps`
fills, `carryOverPlan` is the two together — and both data sources call
`carryOverPlan` (`queries.carryOverBudget`, the seed twin), so they cannot
drift. The operation is "carry over" at every layer: `carryOverBudget` on the
store, the data source and in `queries`, `onCarryOver` on the props,
`CarryOverButton` in the design system.

**Where it copies from is decided per half, and allocations per category.**

- **Income** comes from the latest earlier month holding income to carry.
- **Each allocation** comes from the latest earlier month with a key for that
  category.

The two are searched separately because a month can hold one half without the
other. Setting an allocation on a month with no income writes its budget
document with an empty income list. A single "latest month with a plan" then
picked that month and copied no income, even though the month before had some.
Per category because a half-filled month would otherwise be the source for
everything, and its gaps would stay gaps. A key holding 0 in the latest month
is a decision, and stops the search for that category. The toast names the
sources: "Copied 3 income sources from August 2026 and 11 allocations from
September 2026 and earlier".

It **fills gaps and never overwrites**:

- Income is copied only when the target has **no sources at all**. A month
  holding only the legacy `income` number already has one, and an all-paused
  month still has its sources.
- Copied sources reset `received` (nothing has landed yet) and keep `paused`.
  `one_off` sources are not carried — they belong to the month they landed
  in; `quarterly` ones are, since their amount is per payment.
- An allocation is copied only where the target has **no key** for that
  category. A stored `0` is someone clearing it and is left alone. Only
  current categories are carried, so a deleted one's allocation stays behind.

**"Unset" is one test, `unsetAllocationIds`**, and every surface uses it: the
fill, the Categories manager's copy prompt (both surfaces), and the phone's
Month-tab link. The prompt once offered itself while no allocation was *above
0*. After someone cleared every category to 0, it still offered a copy, and
the copy then reported nothing to do.

`carryOverBudget` on `ExpenseDataSource` is a **write** that reads first,
like `setIncomes` — `watchMonth` is still the only read. The Firestore side
reads the whole `budgets` collection (one document per month), as
`fetchBudgetsByYear` already does, so it needs no index.

The button is `CarryOverButton` (design-system), one component rather than
seven copies, as `DefaultCategoriesButton` is. It is offered wherever an empty
plan shows: the Income page's no-sources state, the "No income set" hint
(desktop Home and Monthly, the phone's summary row), and the Categories
manager while any category has no allocation set. Every one of them runs the
same carry, so each copies allocations as well as income. The hint's copy
hides with its Add income button while the getting-started panel is up. The
Income page and Categories offer it regardless, and a new account that taps it
gets "Nothing to copy" rather than a write.

Demo mode only half-shows it: `seedSource.readBudget` invents the seed income
list for any month with no stored budget, so outside the seed year only
allocations are ever missing there. The income rules were verified against
`carryOverPlan` directly.

### Accounts and balances

`users/{userId}/accounts/{accountId}` is a pot money sits in — a bank account,
a wallet, a card, a loan. `Transaction.accountId` says which one an expense
came out of, and `lib/accounts.ts` turns the two into a balance.

**A balance here is confirmed, not derived, and cannot be derived.** The
identity is `opening + income − expenses ± transfers`, and three of those four
terms do not exist: there are no opening balances, no transfers, and income is
a plan on `budgets/{yearMonth}.incomes` rather than a set of transactions. So
`Account.balance` is the figure last checked against the bank, `balanceAsOf` is
the day it was true, and `accountBalances` projects forward from there over the
expenses tagged since.

Two consequences, and both are load-bearing:

- **Balances only ever move down between reconciliations.** Money arriving is
  invisible. Letting an income source name a destination account was
  considered and rejected: without transfers the app would credit a payroll
  account the whole salary and never see the money moved straight out of it, so
  the figure would read *high* until the next reconcile — worse than one that
  is knowably a floor. Income destination belongs with transfers, whenever
  those land.
- **The projection is only as good as what was logged.** Bank fees, interest,
  auto-debits and any forgotten expense all push it off. That is why no surface
  ever shows a bare figure: every one carries `reconciledOn` beside it, and
  `AccountsPanel` makes Reconcile the primary action on the row rather than a
  field inside an edit form.

`stale` is the guard against the worst version of that, and it checks **both
edges of the window**, which is the part that is easy to get half-right.
Movements come from `state.yearTransactions`, the widest window the snapshot
carries, so a reconciliation from several periods back still projects
correctly. It goes stale when:

- `balanceAsOf` falls **before** the window opened, so movements between the
  two are invisible;
- the window **closes before `today`** — which is exactly what viewing a past
  year means. Every movement since the reconciliation is then outside it,
  `spentSince` collapses to 0, and without this clause the confirmed figure
  would be presented as a current balance: a *confidently wrong* number, which
  is worse than an obviously missing one. `accountBalances` takes `windowEnd`
  as a required argument for this reason — the compiler will not let a caller
  pass only the start;
- there is no `balanceAsOf` at all, since a figure with no date cannot be
  projected from.

A stale row shows the **reconciled** figure with a prompt, and `utilisation` is
taken from whichever figure the row is actually showing — not from `projected`
— so a bar and the amount printed beside it cannot disagree. `accountTotals`
sums the same figure. Note all this makes the horizon the *year in view*:
stepping the month nav into another year reads stale throughout, which is
correct — a balance is a now, not a period.

**Liabilities carry the opposite sign, in exactly one place.** `projectedFor`
adds spend to a card or loan and subtracts it from everything else, so no
caller has to remember which way round it goes. `accountTotals` is the only
other place that knows, and it is what both surfaces use for "net" — so they
cannot disagree about it.

`accountId` follows the **`paymentMethod` contract verbatim** (see the axes
section above): optional, omitted when unset, `deleteField()` to clear, the
create spreading it conditionally while the update always sends the key, and
`denormalize` in `lib/queries.ts` paired with `build` in `data/seedSource.ts`
— **edit those two together** or the field vanishes in seed mode only. Every
row written before accounts existed simply reads as unattributed, so there is
no migration.

The two are **not** the same question and neither replaces the other:
`paymentMethod` exists to reconcile against a card statement and is
calendar-shaped; `accountId` exists to say which balance the money left. Both
composite indexes on `paymentMethod` are untouched, and `accountId` needs none
— balances filter `yearTransactions` client-side rather than querying.

Deleting an account is a **hard** delete and deliberately does not rewrite the
transactions that named it: a stale `accountId` already reads as unattributed
and moves no balance, so rewriting a year of documents to tidy an inert field
would be the more dangerous of the two. There is deliberately no `archived`
flag either — the one a category carries — because nothing would set it, and
a `totals` that filtered archived rows while the list still rendered them would
drop an account out of "net" while it sat there in plain sight.

Because the delete is hard and the confirmed balance and limit go with it,
**Remove is not a button on the row**. It sits at the foot of the edit form
behind a confirm that names what is lost — the same reasoning the income note
gives for keeping a destructive third button away from a thumb-width of Pause,
applied to both surfaces here since they share one `AccountsPanel`.

`order` is unique and assigned with `nextAccountOrder`, never
`accounts.length` — it is the colour **fallback** through `colorForOrder`, so
the category note's collision applies here too.

**Account colour is the mirror image of category colour.** A category's stored
`color` is ignored in favour of `colorForName`, because the template gives a
name its canonical colour; an account has no template, so `Account.color` is
the authority and `colorForOrder(order)` is only what an account that never
picked one falls back to. `accountColor` in `lib/accounts.ts` is the single
place that decision is made, and it is the one the picker in `AccountsPanel`'s
edit form writes to. `ACCOUNT_COLORS` is the offered set — the six
`CATEGORY_RAMP` hues plus a deep amber `#b8860b` the ramp has no room for;
swatches rather than a free hex input, because every entry has to stay dark
enough that a solid fill separates from the page.

The field follows the **`paymentMethod` contract verbatim**: optional, omitted
when unset, `deleteField()` to clear (the picker's Default swatch always sends
the key with no value), the create spreading it conditionally while the update
always sends it — and `createAccount` in `lib/queries.ts` paired with its twin
in `data/seedSource.ts`, **edited together** or a picked colour vanishes in
seed mode only. A value that isn't `#rrggbb` reads as unset rather than
reaching an SVG `fill`, the same narrowing rule the union fields follow. Every
account written before the picker simply keeps its ramp slot, so there is no
migration.

**The mobile nav collapsed to fit this.** Accounts made a seventh button in
`.phone__navgroup`, which overflowed its track by 57px at 375px — enough to
push Settings off the end, and tightening the gap did not fix it (38px hidden
at 8px, 58px at 6px once Home is counted too). Accounts, Categories and
Settings now sit behind one **Manage** button (`mobile-webview/components/
ManageSheet`), which leaves the five tabs plus Manage and nothing hidden — and
clears the 6px the row was already losing before any of this.

That still left each tab 23–41px wide with 11px labels, under the 44px a thumb
needs, because the add button took its own slot in the row. **The add button
now floats** above the bottom-right of the content (`.phone__fab`), the tabs
share the whole bar equally (`flex: 1 1 0`), and labels are back at 12px:
measured 47px per tab in the 360px frame, 50 at 375, 52 at 390. A seventh tab
would still take that to ~40px — measure before adding one. `.phone__scroll`
carries 72px of bottom padding so the last row of a list scrolls clear of the
floating button.

The phone's month label has **previous/next arrows** either side
(`.phone__monthnav`), as desktop does; before them the only way to change
month on the phone was the Year tab. They share the status row with the mode
label and the Sign out pill, which is why a cycle's range stacks *under* the
month inside the pill rather than beside it — side by side the row needed
~386px on a 360px phone once signed in.

### Dashboard cards — one registry, two consumers

`src/lib/dashboardCards.ts` holds `DASHBOARD_CARDS`, the catalog of fifteen
cards the Home tab can draw, grouped `cashflow` / `spending` / `credit` /
`reports`. Two things
read it, so a card added there appears in both at once: the **Home view**
(`desktop/views/HomeView`, `mobile-webview/components/HomeTab`) renders the
chosen ones, and the **picker** (`DashboardCardPicker` / `DashboardCardSheet`)
renders every one of them as a live preview.

The file sits *above* `derive.ts` and adds no arithmetic — every figure comes
out of a function already there (`monthSummary`, `pace`, `incomeBreakdown`,
`categoryTotals`, `donutSegments`, `envelopesByType`, `recurringThisMonth`,
`yearBars`, `yearSummary`). What it adds is selection and shape.

**Cards are scoped to the period in view, never to a rolling window.** The app
this borrows its shape from scopes every card to "last 30 days"; that is the
one thing deliberately not ported. `watchMonth` is the only read on
`ExpenseDataSource`, so a rolling window would need either a new read on that
interface or client-side filtering of `state.yearTransactions` — which covers
only the twelve periods of the year in view, and so would silently truncate a
window straddling January. A card reads what the snapshot already carries and
says which period it read in its own label ("August 2026 · 27 Jul – 26 Aug").
Reports-group cards are year-scoped and labelled with the year alone.

**Every card reduces to one of four bodies** — `stat`, `rows`, `donut`,
`bars` — so the design system ships *one* `DashboardCard` renderer rather than
one component per card. It is surface-neutral (only `.cf-*` classes, charts scaled
through a `viewBox`), which is why the desktop grid and the phone's single
column need no second implementation. A new card needs a new body type only if
it cannot be said as a stat, a list, an arc or a bar chart. `DonutSegment` and
`YearBar` are reused from `derive.ts` rather than mirrored, so a card and the
Monthly/Yearly views cannot disagree about an arc.

Selection lives on `profile/main.dashboardCards`, so it rides the profile arm
of the `watchMonth` fan-out and needs **no new listener** — the same argument
`alerts` and `cycleStartDay` make. It is written whole (`saveDashboardCards`,
`store.setDashboardCards`) because `merge: true` replaces an array rather than
merging it element-wise, exactly as `setIncomes` does; add, remove and reorder
are all that one write.

**Absent and empty mean different things**, and `resolveDashboardCards` in
`queries.ts` is where that is decided. No field at all is an account written
before cards existed, and reads back as `DEFAULT_DASHBOARD_CARDS` so its
dashboard is populated on first sight with no migration — the same trick
`resolveIncomes` and `colorForName` play. A stored `[]` is someone who removed
every card, and is left alone; re-seeding it would put back what they just
cleared, on every snapshot. Unknown ids are dropped on read
(`normalizeDashboardCards`), so retiring a card from the registry makes it
vanish from the accounts that had it rather than crashing their dashboard.

**The Credit group exists now, and what unblocked it was accounts.** The four
cards in the source design — credit used, utilisation by card, debt to income,
debt payments — need balances, limits and monthly payments, and until the
`accounts` collection landed none of that was in the schema. The distinction
that kept them out still holds and is worth keeping straight:
`Transaction.paymentMethod` says *how* something was paid and nothing about
what is owed, so it is `Account.limit` and `Account.monthlyPayment` these read,
never the payment method. A fifth card, `account-balances`, sits in `cashflow`
rather than `credit` — it answers where money *is*, not what is owed.

Three rules those five follow:

- **They take `balances`, not `accounts`.** `DashboardCardContext.balances` is
  already projected, and `store.dashboardCardContext` calls `accountBalancesOf`
  **once**. Handing the cards raw accounts would have five bodies each call
  `accountBalancesForYear` with their own `windowStart`, and the Credit tab
  could then disagree with the accounts sheet about what a card owes.
- **`scope: 'account'` labels them "as of 10 Sep".** A balance is a now, not a
  window, so labelling one with the period in view would claim it was read at a
  date it never consulted — and stepping the month nav would relabel a figure
  that had not moved. `periodLabelFor` branches on all three scopes
  explicitly; nothing falls through to the period label. `debt-to-income` is
  the deliberate exception: its numerator is a standing monthly figure but its
  denominator is the period's income, so it stays `period`-scoped.
- **An unset limit is not a limit of zero.** `accountTotals.creditUtilisation`
  returns 0 through `safeDiv` when no limit is set anywhere, which reads
  identically to "nothing drawn against a real limit" — so
  `credit-utilisation` and `debt-to-income` check the denominator and render
  `—`. This is the same rule as `AlertSettings.monthlyLimit` (an unset cap is
  silent, not permanently breached) and `budget-left`'s income branch. A stale
  balance is surfaced rather than hidden: `accountTotals` counts it at its
  reconciled figure, and the caption says so.

### Committed money vs. spent money — `spent` and `spentToDate`

A period's window includes days that have not happened yet, so a row dated the
25th is in the snapshot on the 2nd. `monthSummary` therefore reports the same
total twice, and **which one a caller reads is the whole decision**:

- **`spent`** — the whole window, scheduled charges included. Everything that
  answers *"how much may I still spend"* reads this: `left` (Budget Left),
  `spentShare`, `leftShare`. A scheduled bill is money that is committed, and a
  Budget Left that ignored it would read **high** — the one direction that
  recreates the problem the app exists to solve.
- **`spentToDate`** — rows dated `<= today`. Only `pace` and `evaluateAlerts`
  read it, and both for the same reason: they compare spending against
  **elapsed time**, so both sides of the comparison must be measured over the
  same window. `pace` already prorates its target by `throughDay`; taking the
  actual from `spent` mixed a whole period's fixed costs into a day-2 figure.

Left unbounded, six bills totalling Rp 5.100.000 dated across the second half
of the period reported "over an even pace by Rp 4.568.497" on **day 1**, with
nothing paid, converging to "under" only around day 10 — every period, from
its first day. That trains the reader to ignore the only signal in the app
that speaks unprompted. A 6.000.000 cap fired an 85% banner on day 1 for the
same reason.

Three rules to keep true when touching this:

- **`today` is a required argument** on `monthSummary`, `evaluateAlerts` and
  `categoryLimitRows` — the same reasoning as `accountBalances`'s `windowEnd`.
  An optional one silently falls back to the whole-window figure, which is the
  bug itself.
- **The bound is `<=`**, matching `accountBalances`, which skips only
  `t.date < balanceAsOf`. A day is spent or it is not; the two surfaces must
  not disagree about which side of it `today` falls on.
- **`pace` must be handed a summary built with the same `today` it is passed.**
  It takes `today` for its target and reads `spentToDate` for its actual, and
  nothing in the types ties the two together — a summary built for one day and
  paced against another compares elapsed time to a different window's spend.
  Every call site derives both from `state.today` / `ctx.today`; keep it that
  way.
- **A bar is measured like the figure beside it.** `spentShareToDate` exists
  only so `spending-pace`'s progress bar matches its own number;
  `budget-left`'s bar stays on `spentShare`. Desktop `MonthlyView`'s hero bar
  and mobile's `stackSegments` scale are paired with `categoryTotals`, which
  counts the whole window, so both deliberately stay unbounded too.

On a closed period every row is `<= today`, so the two figures are equal and
nothing about history changes — that identity is the control this is tested
against, since a bound that dropped *everything* would pass a "day 1 is quiet
now" check just as happily as a correct one.

### First run — the getting-started panel

An account with nothing in it used to open on a bare "Fixed envelopes" label
(desktop) or "Nothing here yet." (mobile), with no next step. Both apps now
render `GettingStarted` (design-system, surface-neutral) above the spend tabs:
categories, then income, then a first expense, each with its own button.
Progress comes from `derive.setupProgress`.

When it shows is the part to keep straight. A missing category list shows it
on any period. A missing expense is read **account-wide**, from
`state.hasTransactions` — never from `yearTransactions`. It used to be the
year's rows, and those are empty on the first period of every new year
(recurring runs written before twelve-period horizons stopped at the year's
last period), so on 1 January every
established account was told to "log your first expense"; and since the panel
being up hides the income hint, its **Copy from last month** vanished at
exactly the moment a new year needs it. It still shows only on the period
containing `today`, so a brand-new account browsing earlier months does not
see it there. Note "ever logged" is really "holds any now": delete every entry
and the panel returns, which is the honest reading of an empty account. **Income never shows it on its
own**: income is per period and does not carry over by itself, so every
account starts each month without any. The summary card's own "No income set"
hint carries **Add income** and **Copy from last month** buttons for that case
instead, on both apps (desktop shows it on Home too, which has no summary
card) — the copy used to
point at "below" (desktop) and "the Month tab" (mobile), neither of which held
income. That button hides while the panel is up, since step two is the same
button.

Desktop Entries tab's Pace check follows the same rule as the Home tab's Spending
pace card: with no income there is no target, so it says to set one rather
than calling every rupiah "over".

### Tabs, and how modals close

Both apps open on **Home**, and the tab that lists the period's entries is
called **Entries** on both. Its key is still `daily`, but it shows the whole
period grouped by day; "Daily" (desktop) and "Today" (mobile) both promised a
single day. Desktop takes its labels from `TAB_LABELS` in `appTypes.ts`. The
phone's Home tab drops the "Left to spend" summary that heads its other tabs,
because Home's Budget left card says the same thing directly below it.
Desktop's Home never had the summary. The summary's **Add income** button
lives outside it, so Home still offers it.

Every modal and sheet is dismissed through `useDismiss` (design-system):

- **Escape** closes only the topmost layer, because mounted layers form a
  stack.
- **On the expense and income forms, Escape or a click on the scrim never
  discards typed input.** Those forms pass `dirty` (the values differ from
  what they opened with). While it is set, a dismiss only raises `nudged`, the
  form shows "You have unsaved changes", and its own Cancel is the one way to
  discard. On the phone the note sits under the sheet's header beside Cancel,
  because the sheets are taller than the screen. A new modal should take the
  hook rather than wire `onClick={onClose}` to its scrim.
- **The other modals are not guarded.** Categories, Accounts, Settings and the
  card picker still close on Escape or a scrim click even mid-edit, for
  example while typing a new category name or an account balance. Guarding
  AccountsPanel would mean lifting its edit state out to the modal. Inside the
  expense form, "Add my own" and "Add an account to track balances" still
  close it and drop what was typed.

When Save is disabled, the expense form says why. `evaluateExpenseForm`
returns `missing` and a ready-worded `hint` ("To save, add a category and
what it was for."), so both surfaces use the same sentence.

### Deleting, and undo

Deleting an entry, a run's remaining months ("Delete this + future months")
or a category with its entries takes effect at once, and the toast that
reports it offers **Undo** (`Toast`, design-system; `store.undo()`). These are
frequent one-tap actions: a confirm would cost a tap on every intended delete
and still lose data on a mis-tap. The category delete keeps its two-click arm
as well, since it cascades through every year. An account's Remove keeps its
named confirm (see Accounts) — it is rare, and what it loses is a confirmed
balance that undo-by-rewrite would be the riskier way to get back.

What makes it work, and what to keep true when touching it:

- **Deletes that reach beyond the snapshot return what they removed**, never
  a count. `deleteTransactionSeries` returns the rows and `deleteCategory` a
  `DeletedCategory`. Those deletes reach into future years for a run and every
  year for a category, so undo cannot rebuild them from `state`. A single
  `deleteTransaction` has nothing beyond the snapshot. Undo restores the
  snapshot's own row, which is the stored document as `toTransaction` read it,
  so it does no read before deleting.
- **Restores write under the original ids** (`restoreTransactions`,
  `restoreCategory`), through `denormalize`, keeping `createdAt`. The same id
  is what keeps `seriesId` meaningful, so "this + future" still reaches a
  restored run. Firestore's `setDoc` to an existing id is harmless; the seed
  twins skip ids already present to match.
- **A category comes back as stored.** `deleteCategory` reads the raw document
  rather than going through `toCategory` or the snapshot. The first resolves
  colour from the name, and the second has corrected former spellings
  ("Apparell" reads as "Apparel"), so restoring from either would rewrite it.
  The category is restored before its entries. Its allocations need nothing,
  because the delete never touched budget keys.
- **One pending undo, and only for the toast on screen.** `mutate` takes an
  `{ note, undo }` from a delete. Every toast goes through `showToastFor`, so
  any later toast, `dismissToast`, the timeout (`UNDO_TOAST_MS`, 7s against an
  ordinary toast's 2.8s) or `reset()` drops it.
- **Undo is generation-guarded.** The pending undo records the generation it
  was created under, and `undo()` refuses across a change. Otherwise an Undo
  pressed around a sign-out would write one account's rows into the next
  one's collection.

On the phone the toast is anchored inside the frame, above the floating add
button, and Undo is a 44px target. At the shared `bottom: 24px` it lay over the
nav bar. The position comes from the stylesheet and has not been measured on a
device.

Income's Remove (desktop row, phone sheet) is the same kind of single-tap
delete and does **not** offer undo yet.

### Spending alerts

Settings live on `profile/main.alerts` — one set per account, already carried
by the profile arm of the `watchMonth` fan-out, so they need no new listener.
They are *evaluated* against whichever period is in view, by
`derive.evaluateAlerts`, which both apps render as banners above the
dashboard on every tab. Both apps reach them from a **Settings** button —
the same surface now hosts `cycleStartDay`, which also lives on the profile.

Spend is counted to `today` only, never past it — see the section above; the
filter is applied once inside `evaluateAlerts` so the monthly cap and every
category cap measure the same window, and `categoryLimitRows` bounds
identically so the settings list cannot contradict the banner it explains.

Two rules, applied to the monthly cap and to each per-category cap alike:
over the limit is a breach, at or past `warnPct` of it is a warning. A limit
of 0 is unset and evaluates to nothing — an unset cap is silent, not
permanently breached. A breach takes the dark ink surface, a warning the pale
accent; no colour is introduced beyond the existing tokens.

**A new account starts with no monthly cap.** `DEFAULT_ALERTS.monthlyLimit` is
0, not the 8.000.000 it once was — a fresh account was being warned against a
number nobody chose. Every alert write stores the whole settings object, so an
account that has ever saved its alerts carries its own `monthlyLimit` and is
unaffected; one that never opened Settings was reading the old default and now
has no cap until it sets one. The seed profile sets 8.000.000 explicitly, so
demo mode still has banners to show.

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
  screens in both apps; Google Sign-in is exercised too, but uses
  `signInWithPopup`, which a real native webview commonly blocks — it works in a
  desktop browser and would need the redirect flow to be reliable inside the
  mobile webview. "Forgot password?" sends a reset link to whatever is in the
  Email field (`AuthController.sendPasswordReset`, wrapping
  `sendPasswordResetEmail` with no `actionCodeSettings`, so the link lands on
  Firebase's own `/__/auth/action` page). The confirmation is worded the same
  whether or not the address has an account: email-enumeration protection is on
  for this project, so Firebase reports success either way and a "no such
  account" branch would never run. It is hidden while creating an account.
- **`signInWithGoogle` sets `prompt: 'select_account'`, deliberately.** A bare
  `new GoogleAuthProvider()` sends no `prompt`, and Google's default is then to
  complete silently whenever exactly one account is signed in to the browser and
  has already consented. Signing out of the app leaves exactly that state —
  `signOutUser` ends the Firebase session, while the Google session is a cookie
  on accounts.google.com that no site may clear — so the next Continue with
  Google went straight back into the same ledger without an account ever being
  chosen. On a shared machine that hands one person's finances to whoever clicks
  next. Forcing the chooser cannot log anyone out of Google, and asks for no
  password; what it buys is that an identity is always chosen explicitly rather
  than supplied silently. `'consent select_account'` was rejected as the
  stronger form: it re-authorizes unchanged scopes on every login and buys
  nothing here.

## Hosting

Both front ends are static Vite SPAs — no server, no SSR — so they deploy to
**Firebase Hosting**, not App Hosting. App Hosting would build them into a Cloud
Run container and bill for a server that has nothing to do.

One Firebase project, two Hosting sites, bound by deploy targets in `.firebaserc`:

| target    | site                                | URL                                               | package                   |
| --------- | ----------------------------------- | ------------------------------------------------- | ------------------------- |
| `desktop` | `personal-finance-dashboard-desktop`| https://personal-finance-dashboard-desktop.web.app| `packages/desktop`        |
| `mobile`  | `personal-finance-dashboard-mobile` | https://personal-finance-dashboard-mobile.web.app | `packages/mobile-webview` |

Neither app is on the project's **default** site, `personal-web-app-projects`.
Desktop was deployed there first and retargeted afterwards, which left it serving
a build that would only rot, so it has been taken dark with `hosting:disable` and
now returns 404. Firebase cannot delete a default site — disabling is as far as
it goes, and deploying to the site again re-enables it. It is still load-bearing
for auth, though; see the handler note below. Both entries in `firebase.json`'s
`hosting` array rewrite `**` to `/index.html` (client-side routing) and set a
one-year immutable `Cache-Control` on `/assets/**`, which is safe because Vite
content-hashes those filenames while `index.html` stays uncached.

```bash
pnpm build && npx firebase-tools deploy --only hosting
```

Always `pnpm build` first: `VITE_FIREBASE_*` is **inlined at build time**, so
deploying a stale or config-less `dist/` ships an app that silently falls back to
the seed dataset. `deploy --only hosting` is deliberate — a bare `firebase deploy`
would also push rules, indexes and auth config.

To swap which app a site serves, no rebuild is needed:

```bash
npx firebase-tools hosting:clone personal-finance-dashboard-mobile:live personal-finance-dashboard-desktop:live
```

**`auth.authorizedDomains` in `firebase.json` is inert.** `deploy --only auth`
applies the `providers` block and *ignores* this field — verified by reading
`identitytoolkit.googleapis.com/admin/v2/projects/…/config` back after a deploy.
The list in the file therefore mirrors what is live rather than driving it, and
authorized domains have to be added in the console (Authentication → Settings →
Authorized domains).

This matters because Firebase auto-authorizes only the **default** site's
domains — and nothing is served from the default site any more. Both
`personal-finance-dashboard-desktop.web.app` and
`personal-finance-dashboard-mobile.web.app` were created with
`hosting:sites:create` and so had to be added by hand — both are in the live
list now. Against an origin missing from it, `signInWithPopup` fails with
`auth/unauthorized-domain`; email/password goes straight to the REST endpoint
and is not domain-gated, so a missing domain breaks one and not the other.

**A disabled default site still serves the auth handler.** `.env`'s
`VITE_FIREBASE_AUTH_DOMAIN` is `personal-web-app-projects.firebaseapp.com`, and
`signInWithPopup` loads `/__/auth/handler` from that domain — so it looked as
though disabling the site would break Google Sign-in. It does not: with the site
disabled and its root returning 404, the handler still answers 200. Firebase
serves the reserved `/__/*` namespace independently of a site's serving state.

Worth knowing before someone "fixes" a broken Google Sign-in by re-enabling the
default site — that would not be the cause. Check the handler directly instead:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://personal-web-app-projects.firebaseapp.com/__/auth/handler
```

Unlike the Firestore named database, Hosting **sites** are fine to create from
the CLI (`hosting:sites:create <id>`); site ids are globally unique across all
of Firebase, so expect to need a suffix.
