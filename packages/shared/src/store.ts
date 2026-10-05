import type { EnvRecord } from './firebase.js';
import {
  DEFAULT_CATEGORIES,
  collidingCategoryOrders,
  colorForName,
  nextCategoryOrder,
  normalizeCategoryName,
  resolveSession,
  type ExpenseDataSource,
} from './data/index.js';
import {
  clampCycleStartDay,
  currentYearMonth,
  cycleOf,
  cycleRangeLabel,
  dateInCycle,
  todayISO,
  toYear,
  toYearMonth,
  yearMonthOf,
  yearOfMonth,
} from './lib/dates.js';
import type {
  Account,
  AccountInput,
  AccountPatch,
  AlertSettings,
  Budget,
  Category,
  CategoryType,
  Income,
  IncomeInput,
  IncomePatch,
  PaymentMethod,
  Profile,
  Transaction,
  WarnPct,
} from './types.js';
import { MAX_INCOME_DAY } from './types.js';
import {
  accountBalancesForYear,
  nextAccountOrder,
  type AccountBalance,
} from './lib/accounts.js';
import { DEFAULT_PROFILE, defaultAlerts } from './lib/queries.js';
import {
  dashboardCardSpec,
  isDashboardCardId,
  normalizeDashboardCards,
  type DashboardCardContext,
  type DashboardCardId,
} from './lib/dashboardCards.js';
import type { MoneyFormat } from './lib/format.js';

/**
 * Framework-agnostic application state.
 *
 * Both front ends drive this same store — the desktop dashboard and the
 * mobile webview differ only in how they render its snapshot. React binds to
 * it with `useSyncExternalStore(store.subscribe, store.getSnapshot)`, which
 * keeps React out of this package entirely.
 */

export type Status = 'loading' | 'ready' | 'error';

export interface ExpenseState {
  status: Status;
  error: string | null;
  /** non-fatal: e.g. running on demo data */
  warning: string | null;
  mode: 'firestore' | 'seed';
  userId: string;
  /**
   * The period in view, "YYYY-MM". A calendar month when
   * `profile.cycleStartDay` is 1, otherwise the salary cycle ending in that
   * month — the id shape is the same either way, so month nav, budget document
   * ids and the month labels are unaffected by which it is.
   */
  yearMonth: string;
  /** "YYYY-MM-DD", fixed for the session */
  today: string;
  /** every account, in `order`; balances are projected by `lib/accounts.ts` */
  accounts: Account[];
  categories: Category[];
  /** transactions of the period `yearMonth` */
  monthTransactions: Transaction[];
  /** transactions of the twelve periods labelled by the year of `yearMonth` */
  yearTransactions: Transaction[];
  budget: Budget | null;
  profile: Profile;
  /** a write is in flight */
  busy: boolean;
  toast: string | null;
}

export interface ExpenseDraft {
  /** what the expense is for */
  categoryId: string;
  /**
   * How it was paid — optional, and independent of `categoryId`. `undefined`
   * on an update means "unset it", which is why the form always supplies the
   * key rather than spreading it in conditionally.
   */
  paymentMethod?: PaymentMethod;
  /**
   * Which account the money left. `undefined` on an update means "unset it",
   * which is why the form always supplies the key rather than spreading it in
   * conditionally — the same contract `paymentMethod` has.
   */
  accountId?: string;
  item: string;
  amount: number;
  /**
   * Day of the month, clamped into the visible period. Under a salary cycle
   * each day-of-month occurs at most once in the window, so this still names
   * exactly one date — `dateInCycle` is what resolves it.
   */
  day: number;
  /** write one document per remaining period of the year */
  repeat: boolean;
  note?: string;
}

const initialState = (yearMonth: string, today: string): ExpenseState => ({
  status: 'loading',
  error: null,
  warning: null,
  mode: 'seed',
  userId: '',
  yearMonth,
  today,
  accounts: [],
  categories: [],
  monthTransactions: [],
  yearTransactions: [],
  budget: null,
  // `alerts` and `dashboardCards` are both copied out rather than shared: a
  // bare spread would leave every store pointing at the one array inside the
  // exported `DEFAULT_PROFILE`, so a single in-place edit would corrupt the
  // default for every store built afterwards. `queries.toProfile` guards the
  // same case the same way.
  profile: {
    ...DEFAULT_PROFILE,
    alerts: defaultAlerts(),
    dashboardCards: [...DEFAULT_PROFILE.dashboardCards],
  },
  busy: false,
  toast: null,
});

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class ExpenseStore {
  private state: ExpenseState;
  private listeners = new Set<() => void>();
  private source: ExpenseDataSource | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Bumped by every `reset()`, so each load can tell whether it still owns the
   * store. Awaited work captures the value it started under and drops its
   * result if it no longer matches — without this a slow read for the previous
   * account can land after a new one has signed in.
   */
  private generation = 0;
  /** Tears down the live period subscription. Null when nothing is watched. */
  private stopWatching: (() => void) | null = null;
  /**
   * True once the user has navigated to a period themselves.
   *
   * The cycle start day only arrives with the profile, so the period a session
   * opens on is a guess that gets corrected on the first snapshot. This is what
   * stops that correction yanking someone off a period they deliberately
   * navigated to.
   */
  private pinned = false;

  constructor(today: string = todayISO()) {
    this.state = initialState(currentYearMonth(), today);
  }

  /* ------------------------------------------------------ subscription */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ExpenseState => this.state;

  private set(patch: Partial<ExpenseState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /* ------------------------------------------------------------- setup */

  /**
   * Loads the data for a signed-in identity. `userId` comes from
   * `AuthController`; omitting it (no Firebase configured) yields seed data.
   *
   * Safe to call again for a different account — the previous user's rows are
   * cleared first, so a slow reload never shows them under the new uid.
   */
  async init(env: EnvRecord | undefined, userId?: string): Promise<void> {
    this.reset();
    const generation = this.generation;
    try {
      const session = await resolveSession(env, userId);
      if (generation !== this.generation) return;
      this.source = session.source;
      this.set({
        mode: session.mode,
        userId: session.userId,
        warning: session.warning ?? null,
      });
      this.watchCurrentMonth(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.set({ status: 'error', error: message(error) });
    }
  }

  /**
   * Drops every loaded row and the data source. Called on sign-out.
   *
   * Bumping the generation is what actually orphans work already in flight —
   * clearing the state alone would be undone by the next `set` from a read
   * that started under the previous account.
   */
  reset(): void {
    this.generation += 1;
    this.unwatch();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = null;
    this.source = null;
    this.pinned = false;
    this.state = initialState(this.state.yearMonth, this.state.today);
    for (const listener of this.listeners) listener();
  }

  /**
   * Points the live subscription at the current `yearMonth`.
   *
   * Kept as `reload` because callers still mean "make the view current" — but
   * nothing is re-read here. The month arrives by subscription and keeps
   * arriving, so writes from another tab, another device or the other app
   * repaint without anyone asking.
   */
  async reload(): Promise<void> {
    this.watchCurrentMonth(this.generation);
  }

  /**
   * (Re)subscribes to `yearMonth`, tearing down any previous subscription
   * first.
   *
   * `generation` pins this to the account that asked. A listener outliving its
   * account is worse than a stale one-shot read — it keeps firing — so every
   * callback checks the generation before touching state, and `reset()` both
   * bumps the generation and unsubscribes.
   */
  private watchCurrentMonth(generation: number): void {
    const source = this.source;
    if (!source) return;

    this.unwatch();
    const { yearMonth } = this.state;
    const cycleStartDay = this.state.profile.cycleStartDay;

    this.stopWatching = source.watchMonth(
      yearMonth,
      cycleStartDay,
      (snapshot) => {
        if (generation !== this.generation) return;

        /*
         * How wide a period is lives on the profile, which arrives *with* this
         * snapshot — so the subscription that produced it was opened on the
         * last known start day, and on the first load of a session that is a
         * guess. When the arriving profile disagrees, re-point instead of
         * painting: `status` is deliberately left alone, so a first load holds
         * on `loading` rather than flashing a calendar month before the cycle
         * replaces it, while a later change to the setting repaints in place.
         *
         * This always converges — the second subscription is opened with the
         * start day this one reported, so its snapshot matches.
         */
        const startDay = snapshot.profile.cycleStartDay;
        const wanted = this.pinned ? yearMonth : cycleOf(this.state.today, startDay);
        if (startDay !== cycleStartDay || wanted !== yearMonth) {
          this.set({ profile: snapshot.profile, yearMonth: wanted });
          this.watchCurrentMonth(generation);
          return;
        }

        this.set({
          status: 'ready',
          error: null,
          accounts: snapshot.accounts,
          categories: snapshot.categories,
          monthTransactions: snapshot.monthTransactions,
          yearTransactions: snapshot.yearTransactions,
          budget: snapshot.budget,
          profile: snapshot.profile,
        });
      },
      (error) => {
        if (generation !== this.generation) return;
        this.set({ status: 'error', error: message(error) });
      },
    );
  }

  /** Drops the live subscription, if any. */
  private unwatch(): void {
    this.stopWatching?.();
    this.stopWatching = null;
  }

  /* ----------------------------------------------------------- actions */

  async setYearMonth(yearMonth: string): Promise<void> {
    // Pinned even when the period is unchanged: asking for it at all is a
    // deliberate choice, and the profile landing later must not override it.
    this.pinned = true;
    if (yearMonth === this.state.yearMonth) return;
    this.set({ yearMonth });
    await this.reload();
  }

  showToast(text: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.set({ toast: text });
    this.toastTimer = setTimeout(() => this.set({ toast: null }), 2800);
  }

  dismissToast(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.set({ toast: null });
  }

  /**
   * The month's budget, or an empty one to merge into. A fresh month has no
   * `budgets/{yearMonth}` document at all, and four call sites were each
   * spelling this fallback out.
   */
  private budgetBase(): Budget {
    const { budget, yearMonth } = this.state;
    return budget ?? { id: yearMonth, income: 0, incomes: [], categoryBudgets: {} };
  }

  private async mutate(work: () => Promise<string>): Promise<void> {
    if (!this.source) return;
    const generation = this.generation;
    this.set({ busy: true });
    try {
      const note = await work();
      if (generation !== this.generation) return;
      // No reload: the subscription delivers the write. Firestore's latency
      // compensation has usually already painted it before this line runs.
      this.showToast(note);
    } catch (error) {
      if (generation !== this.generation) return;
      this.set({ error: message(error) });
      this.showToast(`Could not save — ${message(error)}`);
    } finally {
      // A reset already cleared `busy`; setting it here would resurrect the
      // orphaned write's state on top of the new account's.
      if (generation === this.generation) this.set({ busy: false });
    }
  }

  async addExpense(draft: ExpenseDraft): Promise<void> {
    const source = this.source;
    if (!source) return;

    const { yearMonth, profile } = this.state;
    const date = dateInCycle(yearMonth, draft.day, profile.cycleStartDay);
    const input = {
      categoryId: draft.categoryId,
      item: draft.item.trim(),
      amount: draft.amount,
      date,
      ...(draft.note ? { note: draft.note } : {}),
      // On a create there is nothing to unset, so omit it when there's no
      // value rather than writing an empty field.
      ...(draft.paymentMethod ? { paymentMethod: draft.paymentMethod } : {}),
      ...(draft.accountId ? { accountId: draft.accountId } : {}),
    };

    await this.mutate(async () => {
      if (draft.repeat) {
        /*
         * "Every remaining period of the year". `seriesDates` steps calendar
         * months, so the bound has to be the calendar month *this day* falls in
         * for the year's last period — which half of the window a day lands in
         * depends on the day itself. A day at or above the start day sits in
         * the opening month (28 -> "2026-11"), one below it in the closing
         * month (3 -> "2026-12"); a single fixed bound serves one and truncates
         * or overshoots the other. At a start day of 1 this is `${year}-12`,
         * exactly as it was.
         */
        const lastPeriod = yearMonthOf(Number(yearOfMonth(yearMonth)), 12);
        const through = toYearMonth(dateInCycle(lastPeriod, draft.day, profile.cycleStartDay));
        const rows = await source.createTransactionSeries(input, through);
        // Repeating from December leaves a single month — don't say "1 months".
        return rows.length > 1
          ? `${input.item} saved — repeats for ${rows.length} months`
          : `${input.item} saved`;
      }
      await source.createTransaction(input);
      return `${input.item} saved`;
    });
  }

  async updateExpense(transactionId: string, draft: ExpenseDraft): Promise<void> {
    const source = this.source;
    if (!source) return;

    const date = dateInCycle(
      this.state.yearMonth,
      draft.day,
      this.state.profile.cycleStartDay,
    );
    await this.mutate(async () => {
      await source.updateTransaction(transactionId, {
        categoryId: draft.categoryId,
        item: draft.item.trim(),
        amount: draft.amount,
        date,
        ...(draft.note ? { note: draft.note } : {}),
        // Always sent, `undefined` included: the key's presence is what tells
        // `updateTransaction` to remove a method the user just cleared.
        paymentMethod: draft.paymentMethod,
        accountId: draft.accountId,
      });
      return `${draft.item.trim()} updated`;
    });
  }

  async deleteExpense(transaction: Transaction): Promise<void> {
    const source = this.source;
    if (!source) return;
    await this.mutate(async () => {
      await source.deleteTransaction(transaction.id);
      return `${transaction.item} deleted`;
    });
  }

  /**
   * "This and future months" for a repeating charge. Only entries carrying a
   * non-null `seriesId` belong to a run — a one-off falls back to a single
   * delete.
   */
  async deleteExpenseSeries(transaction: Transaction): Promise<void> {
    const source = this.source;
    if (!source) return;
    if (transaction.seriesId === null) {
      await this.deleteExpense(transaction);
      return;
    }
    const seriesId = transaction.seriesId;
    await this.mutate(async () => {
      const removed = await source.deleteTransactionSeries({
        seriesId,
        fromDate: transaction.date,
      });
      return `${transaction.item} deleted from ${removed} ${removed === 1 ? 'month' : 'months'}`;
    });
  }

  /* ---------------------------------------------------------- accounts */

  /**
   * Adds an account.
   *
   * `order` comes from `nextAccountOrder`, never `accounts.length` — colour is
   * resolved from it, so a collision after a delete would put two accounts on
   * one ramp slot and tie them under the sort.
   *
   * A new account is reconciled by definition: whatever balance is entered is
   * true as of today, so `balanceAsOf` defaults to the session's date rather
   * than being left empty for the projection to choke on.
   */
  async addAccount(input: Omit<AccountInput, 'order' | 'balanceAsOf'> & {
    balanceAsOf?: string;
  }): Promise<void> {
    const source = this.source;
    if (!source) return;

    const name = input.name.trim();
    if (!name) return;
    if (this.state.accounts.some((a) => a.name.trim().toLowerCase() === name.toLowerCase())) {
      this.showToast(`${name} already exists`);
      return;
    }

    const order = nextAccountOrder(this.state.accounts);
    await this.mutate(async () => {
      await source.createAccount({
        name,
        type: input.type,
        balance: input.balance,
        balanceAsOf: input.balanceAsOf ?? this.state.today,
        limit: input.limit,
        monthlyPayment: input.monthlyPayment,
        order,
        // Conditional, not `color: input.color` — the create must omit the key
        // rather than write `undefined`, which Firestore rejects.
        ...(input.color ? { color: input.color } : {}),
      });
      return `${name} added`;
    });
  }

  async updateAccount(accountId: string, patch: AccountPatch): Promise<void> {
    const source = this.source;
    if (!source) return;
    const account = this.state.accounts.find((a) => a.id === accountId);
    if (!account) return;

    const next: AccountPatch = { ...patch };
    if (next.name !== undefined) {
      const name = next.name.trim();
      if (!name) return;
      next.name = name;
    }
    await this.mutate(async () => {
      await source.updateAccount(accountId, next);
      return `${next.name ?? account.name} updated`;
    });
  }

  /**
   * Confirms what an account actually holds, as of a date.
   *
   * The single most important action on the accounts surface: a projected
   * balance is only ever as good as the last time this ran, because money
   * arriving is invisible to an app that records expenses alone.
   */
  async reconcileAccount(accountId: string, balance: number, asOf?: string): Promise<void> {
    const source = this.source;
    if (!source) return;
    const account = this.state.accounts.find((a) => a.id === accountId);
    if (!account) return;

    const date = asOf ?? this.state.today;
    await this.mutate(async () => {
      await source.reconcileAccount(accountId, balance, date);
      return `${account.name} reconciled`;
    });
  }

  /**
   * Removes an account. The transactions that named it keep the id and read as
   * unattributed — `accountId` is omitted-when-unset, so a stale one already
   * moves no balance, and rewriting a year of documents to tidy an inert field
   * would be the more dangerous of the two.
   */
  async deleteAccount(account: Account): Promise<void> {
    const source = this.source;
    if (!source) return;
    await this.mutate(async () => {
      await source.deleteAccount(account.id);
      return `${account.name} removed`;
    });
  }

  async addCategory(name: string, type: CategoryType, allocation = 0): Promise<void> {
    const source = this.source;
    if (!source) return;

    const trimmed = name.trim();
    const { categories } = this.state;
    if (!trimmed) return;
    if (categories.some((c) => normalizeCategoryName(c.name) === normalizeCategoryName(trimmed))) {
      this.showToast(`${trimmed} already exists`);
      return;
    }

    const order = nextCategoryOrder(categories);
    await this.mutate(async () => {
      const created = await source.createCategory({
        name: trimmed,
        type,
        color: colorForName(trimmed, order),
        icon: '',
        order,
        archived: false,
      });
      if (allocation > 0) {
        const base = this.budgetBase();
        await source.saveBudget({
          ...base,
          categoryBudgets: { ...base.categoryBudgets, [created.id]: allocation },
        });
      }
      return `${trimmed} added as a ${type} category`;
    });
  }

  /**
   * Writes the spreadsheet's category set (`DEFAULT_CATEGORIES`) into the
   * account in one go, with each one's monthly allocation for the month in
   * view. Only ever runs when the user asks for it — nothing seeds itself.
   *
   * Names already present are skipped rather than duplicated, so running it
   * against a half-populated account tops it up instead of creating a second
   * "Groceries". Allocations go in a single `saveBudget` at the end, once the
   * created ids are known.
   *
   * This is the only bulk write, so it is also where the `order` uniqueness
   * invariant is checked — see the toast below.
   */
  async addDefaultCategories(): Promise<void> {
    const source = this.source;
    if (!source) return;

    const { categories } = this.state;

    /*
     * Surfaced, not repaired. `nextCategoryOrder` makes new collisions
     * impossible, so this can only fire on documents written before that fix.
     * Rewriting `order` here would recolour those categories without being
     * asked, and the seed below is unaffected either way — it appends from
     * `max(order) + 1`.
     */
    const collisions = collidingCategoryOrders(categories);
    // Appended to whichever toast this call ends on, never shown as its own.
    // Only one toast is visible at a time, so a separate warning here would be
    // overwritten by the outcome message a moment later — and on an
    // already-seeded account that is every single time.
    const warning =
      collisions.length > 0 ? ` — heads up, ${collisions.join(', ')} share a display slot` : '';

    const taken = new Set(categories.map((c) => normalizeCategoryName(c.name)));
    const missing = DEFAULT_CATEGORIES.filter((c) => !taken.has(normalizeCategoryName(c.name)));

    if (missing.length === 0) {
      this.showToast(`Default categories are already set up${warning}`);
      return;
    }

    await this.mutate(async () => {
      const allocations: Record<string, number> = {};

      // Sequential, so `order` follows the sheet's order rather than
      // whichever write happens to land first.
      const base = nextCategoryOrder(categories);
      for (const [i, c] of missing.entries()) {
        const order = base + i;
        const created = await source.createCategory({
          name: c.name,
          type: c.type,
          color: colorForName(c.name, order),
          icon: c.icon,
          order,
          archived: false,
        });
        if (c.allocation > 0) allocations[created.id] = c.allocation;
      }

      if (Object.keys(allocations).length > 0) {
        const base = this.budgetBase();
        await source.saveBudget({
          ...base,
          categoryBudgets: { ...base.categoryBudgets, ...allocations },
        });
      }

      return `${missing.length} ${missing.length === 1 ? 'category' : 'categories'} added${warning}`;
    });
  }

  async deleteCategory(category: Category): Promise<void> {
    const source = this.source;
    if (!source) return;
    await this.mutate(async () => {
      const removed = await source.deleteCategory(category.id);
      return removed > 0
        ? `${category.name} deleted with ${removed} ${removed === 1 ? 'entry' : 'entries'}`
        : `${category.name} deleted`;
    });
  }

  /* ---------------------------------------------------------- income */

  /**
   * Writes the month's income list.
   *
   * Delegated rather than merged here: the data source reads the stored
   * budget first, so a concurrent allocation change isn't clobbered by
   * whatever this tab last rendered.
   */
  private async writeIncomes(incomes: Income[], note: string): Promise<void> {
    const source = this.source;
    if (!source) return;
    const { yearMonth } = this.state;
    await this.mutate(async () => {
      await source.setIncomes(yearMonth, incomes);
      return note;
    });
  }

  async addIncome(input: IncomeInput): Promise<void> {
    const trimmed = input.name.trim();
    // Name and amount are both required; the forms disable their submit, but
    // the rule belongs here too so it holds for every caller.
    if (!trimmed || input.amount <= 0) return;
    const note = input.note?.trim();
    const income: Income = {
      id: newIncomeId(),
      name: trimmed,
      amount: input.amount,
      cadence: input.cadence,
      kind: input.kind,
      day: clampIncomeDay(input.day),
      received: input.received,
      paused: input.paused,
      ...(note ? { note } : {}),
    };
    await this.writeIncomes(
      [...this.budgetBase().incomes, income],
      `${trimmed} added to income`,
    );
  }

  async updateIncome(incomeId: string, patch: IncomePatch): Promise<void> {
    const incomes = this.budgetBase().incomes;
    const current = incomes.find((i) => i.id === incomeId);
    if (!current) return;

    const name = patch.name === undefined ? current.name : patch.name.trim();
    const rawNote = patch.note === undefined ? current.note : patch.note.trim();
    if (!name) return;

    const next: Income = {
      ...current,
      ...patch,
      id: current.id,
      name,
      day: clampIncomeDay(patch.day === undefined ? current.day : patch.day),
      // Kept optional rather than stored as "": an empty note is no note, and
      // Firestore would otherwise hold an empty string forever. The key is
      // deleted rather than set to undefined — an array element carrying
      // `undefined` is a value Firestore rejects outright.
      note: rawNote || undefined,
    };
    if (!next.note) delete next.note;

    await this.writeIncomes(
      incomes.map((i) => (i.id === incomeId ? next : i)),
      `${name} updated`,
    );
  }

  /**
   * Pauses or resumes a source.
   *
   * A separate method rather than an `updateIncome` call from the views
   * because it is the one income edit that moves Budget Left, and the toast
   * has to say so in the caller's words rather than "updated".
   */
  async setIncomePaused(incomeId: string, paused: boolean): Promise<void> {
    const incomes = this.budgetBase().incomes;
    const current = incomes.find((i) => i.id === incomeId);
    if (!current || current.paused === paused) return;
    await this.writeIncomes(
      incomes.map((i) => (i.id === incomeId ? { ...i, paused } : i)),
      `${current.name} ${paused ? 'paused' : 'resumed'}`,
    );
  }

  /** Marks this month's payment as landed, or not yet. */
  async setIncomeReceived(incomeId: string, received: boolean): Promise<void> {
    const incomes = this.budgetBase().incomes;
    const current = incomes.find((i) => i.id === incomeId);
    if (!current || current.received === received) return;
    await this.writeIncomes(
      incomes.map((i) => (i.id === incomeId ? { ...i, received } : i)),
      `${current.name} marked ${received ? 'received' : 'not received'}`,
    );
  }

  /**
   * Removes a source, unless it is the last one.
   *
   * The guard lives here and not only on the button: two tabs can each be
   * showing the same two sources, and both delete buttons are enabled. Each
   * write replaces the whole list from the tab's own snapshot, so as long as
   * every writer refuses to go below one, the month keeps a source.
   */
  async deleteIncome(incomeId: string): Promise<void> {
    const incomes = this.budgetBase().incomes;
    const target = incomes.find((i) => i.id === incomeId);
    if (!target) return;
    if (incomes.length <= 1) {
      this.showToast('Keep at least one income source');
      return;
    }
    await this.writeIncomes(
      incomes.filter((i) => i.id !== incomeId),
      `${target.name} removed`,
    );
  }

  /* ---------------------------------------------------------- alerts */

  /**
   * Writes alert settings, which live on the profile rather than the month —
   * one set of caps, evaluated against whichever month is in view.
   */
  private async writeAlerts(patch: Partial<AlertSettings>, note: string): Promise<void> {
    const source = this.source;
    if (!source) return;
    const next: AlertSettings = { ...this.state.profile.alerts, ...patch };
    await this.mutate(async () => {
      await source.setAlerts(next);
      return note;
    });
  }

  /* ------------------------------------------------- the tracking cycle */

  /**
   * Sets the day a period opens on. Like alerts this lives on the profile, not
   * the month — and nothing stored on a transaction depends on it, so moving it
   * re-windows history rather than rewriting it.
   *
   * No reload here: the profile arrives by subscription, and the snapshot
   * handler re-points the period as soon as it does.
   */
  async setCycleStartDay(cycleStartDay: number): Promise<void> {
    const source = this.source;
    if (!source) return;
    const day = clampCycleStartDay(cycleStartDay);
    await this.mutate(async () => {
      await source.setCycleStartDay(day);
      return day === 1 ? 'Tracking calendar months' : `Cycle starts on day ${day}`;
    });
  }

  /* --------------------------------------------------- dashboard cards */

  /**
   * Writes the whole card list, which is what add, remove and reorder all
   * reduce to — `merge: true` replaces an array outright rather than merging
   * it element-wise, the same reason `writeIncomes` exists.
   *
   * No reload: the list lives on the profile, which already arrives by the
   * profile arm of the `watchMonth` fan-out.
   */
  private async writeDashboardCards(cards: readonly string[], note: string): Promise<void> {
    const source = this.source;
    if (!source) return;
    const next = normalizeDashboardCards(cards);
    await this.mutate(async () => {
      await source.setDashboardCards(next);
      return note;
    });
  }

  /** Replaces the list outright — used by the picker's reset and reorder. */
  async setDashboardCards(cards: readonly string[]): Promise<void> {
    await this.writeDashboardCards(cards, 'Dashboard updated');
  }

  /**
   * Appends a card. A card already on the dashboard is left where it is.
   *
   * The `isDashboardCardId` guard here and on the two below is not belt and
   * braces: a card retired from the registry vanishes from the *rendered*
   * dashboard, because `buildDashboardCards` narrows, but a stale render still
   * holds a button wired to its id. Reading the spec for a toast would throw.
   */
  async addDashboardCard(id: DashboardCardId): Promise<void> {
    if (!isDashboardCardId(id)) return;
    const current = this.state.profile.dashboardCards;
    if (current.includes(id)) return;
    await this.writeDashboardCards([...current, id], `${dashboardCardSpec(id).title} added`);
  }

  async removeDashboardCard(id: DashboardCardId): Promise<void> {
    if (!isDashboardCardId(id)) return;
    const current = this.state.profile.dashboardCards;
    if (!current.includes(id)) return;
    await this.writeDashboardCards(
      current.filter((c) => c !== id),
      `${dashboardCardSpec(id).title} removed`,
    );
  }

  /**
   * Moves a card one place up (`-1`) or down (`+1`). A move off either end is
   * a no-op rather than a wrap — the buttons are hidden there, but two tabs
   * can each be showing a different list.
   */
  async moveDashboardCard(id: DashboardCardId, delta: number): Promise<void> {
    if (!isDashboardCardId(id)) return;
    const current = [...this.state.profile.dashboardCards];
    const from = current.indexOf(id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= current.length) return;
    const [moved] = current.splice(from, 1);
    if (moved === undefined) return;
    current.splice(to, 0, moved);
    await this.writeDashboardCards(current, `${dashboardCardSpec(id).title} moved`);
  }

  async setAlertsEnabled(enabled: boolean): Promise<void> {
    await this.writeAlerts({ enabled }, enabled ? 'Alerts on' : 'Alerts off');
  }

  async setMonthlyLimit(monthlyLimit: number): Promise<void> {
    await this.writeAlerts(
      { monthlyLimit },
      monthlyLimit > 0 ? 'Monthly limit updated' : 'Monthly limit cleared',
    );
  }

  async setWarnPct(warnPct: WarnPct): Promise<void> {
    await this.writeAlerts({ warnPct }, `Warning at ${warnPct}%`);
  }

  /**
   * Sets one category's cap. An amount of 0 clears it.
   *
   * The key is canonicalised to the category's own `name` and any key that
   * differs only by case or padding is dropped on the way through, so a cap
   * can never end up stored twice under two spellings of one category.
   */
  async setCategoryLimit(categoryName: string, amount: number): Promise<void> {
    const wanted = normalizeCategoryName(categoryName);
    if (!wanted) return;

    const match = this.state.categories.find((c) => normalizeCategoryName(c.name) === wanted);
    const key = match?.name ?? categoryName.trim();

    const next: Record<string, number> = {};
    for (const [name, limit] of Object.entries(this.state.profile.alerts.categoryLimits)) {
      if (normalizeCategoryName(name) !== wanted) next[name] = limit;
    }
    if (amount > 0) next[key] = amount;

    await this.writeAlerts(
      { categoryLimits: next },
      amount > 0 ? `${key} limit set` : `${key} limit cleared`,
    );
  }

  clearCategoryLimit(categoryName: string): Promise<void> {
    return this.setCategoryLimit(categoryName, 0);
  }

  async setCategoryBudget(categoryId: string, amount: number): Promise<void> {
    const source = this.source;
    if (!source) return;
    const { yearMonth } = this.state;
    await this.mutate(async () => {
      await source.setCategoryBudget(yearMonth, categoryId, amount);
      return 'Allocation updated';
    });
  }
}



/*
 * Income ids are minted on the client: sources are elements of an array on the
 * budget document, not documents of their own, so Firestore never assigns one.
 * The counter is what keeps two sources added in the same millisecond apart —
 * the same collision `newCategoryId` guards against in the seed source.
 */
/** Keeps a pay day inside the range every month can honour. */
const clampIncomeDay = (day: number): number =>
  Math.min(MAX_INCOME_DAY, Math.max(1, Math.trunc(day) || 1));

let incomeSeq = 0;
const newIncomeId = (): string =>
  `income-${Date.now().toString(36)}-${(++incomeSeq).toString(36)}`;

/** The calendar year of the month in view — the yearly tab's scope. */
export const yearInView = (state: ExpenseState): string => yearOfMonth(state.yearMonth);

/** True when the period in view is the one today falls in. */
export const isCurrentMonth = (state: ExpenseState): boolean =>
  state.yearMonth === cycleOf(state.today, state.profile.cycleStartDay);

/** How wide a period is — 1 for calendar months. */
export const cycleStartDayOf = (state: ExpenseState): number => state.profile.cycleStartDay;

/**
 * The period in view as a date range — "27 Aug – 26 Sep". Empty on calendar
 * months, where the month label already says everything the range would.
 */
export const periodRangeLabel = (state: ExpenseState): string =>
  cycleRangeLabel(state.yearMonth, state.profile.cycleStartDay);

export const currentYearOf = (state: ExpenseState): string => toYear(state.today);

/**
 * Account balances from the snapshot.
 *
 * Lives here rather than in `lib/accounts.ts` because it is the piece that has
 * to know about `ExpenseState`, and `store.ts` imports the lib rather than the
 * other way round — the same split `dashboardCardContext` makes.
 *
 * Movements come from `yearTransactions`, the widest window the snapshot
 * carries, and the window's **end** is passed as well as its start. That makes
 * the projection's horizon the **year in view**: step the month nav into a
 * past year and every balance reports `stale`, because a window that closes
 * before today cannot see the movements since. That is correct rather than
 * unfortunate — a balance is a now, not a period, so a stale marker is the
 * honest answer to "what did this account hold in 2025".
 */
export const accountBalancesOf = (state: ExpenseState): AccountBalance[] =>
  accountBalancesForYear(state.accounts, state.yearTransactions, state.today, state.yearMonth);

/**
 * The snapshot, as the card builders want it.
 *
 * Lives here rather than in `lib/dashboardCards.ts` because it is the one
 * piece that has to know about `ExpenseState`, and `store.ts` imports the lib
 * rather than the other way round. Both apps go through it, so the desktop
 * grid and the phone column can never build their cards from different inputs.
 */
export const dashboardCardContext = (
  state: ExpenseState,
  fmt: MoneyFormat,
): DashboardCardContext => ({
  yearMonth: state.yearMonth,
  today: state.today,
  cycleStartDay: state.profile.cycleStartDay,
  categories: state.categories,
  monthTransactions: state.monthTransactions,
  yearTransactions: state.yearTransactions,
  // Projected once, here, rather than five times inside the credit cards —
  // see the note on `DashboardCardContext.balances`.
  balances: accountBalancesOf(state),
  budget: state.budget,
  fmt,
});
