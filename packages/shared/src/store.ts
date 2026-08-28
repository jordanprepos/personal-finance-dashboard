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
import { currentYearMonth, dateInMonth, todayISO, toYear, yearOfMonth } from './lib/dates.js';
import type {
  AlertSettings,
  Budget,
  Category,
  CategoryType,
  Income,
  Profile,
  Transaction,
  WarnPct,
} from './types.js';
import { DEFAULT_PROFILE, defaultAlerts } from './lib/queries.js';

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
  /** the month in view, "YYYY-MM" */
  yearMonth: string;
  /** "YYYY-MM-DD", fixed for the session */
  today: string;
  categories: Category[];
  /** transactions of `yearMonth` */
  monthTransactions: Transaction[];
  /** transactions of the whole calendar year containing `yearMonth` */
  yearTransactions: Transaction[];
  budget: Budget | null;
  profile: Profile;
  /** a write is in flight */
  busy: boolean;
  toast: string | null;
}

export interface ExpenseDraft {
  categoryId: string;
  item: string;
  amount: number;
  /** day of month; clamped into the visible month */
  day: number;
  /** write one document per remaining month of the year */
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
  categories: [],
  monthTransactions: [],
  yearTransactions: [],
  budget: null,
  profile: { ...DEFAULT_PROFILE, alerts: defaultAlerts() },
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
  /** Tears down the live month subscription. Null when nothing is watched. */
  private stopWatching: (() => void) | null = null;

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

    this.stopWatching = source.watchMonth(
      yearMonth,
      (snapshot) => {
        if (generation !== this.generation) return;
        this.set({
          status: 'ready',
          error: null,
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

    const { yearMonth } = this.state;
    const date = dateInMonth(yearMonth, draft.day);
    const input = {
      categoryId: draft.categoryId,
      item: draft.item.trim(),
      amount: draft.amount,
      date,
      ...(draft.note ? { note: draft.note } : {}),
    };

    await this.mutate(async () => {
      if (draft.repeat) {
        const through = `${yearOfMonth(yearMonth)}-12`;
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

    const date = dateInMonth(this.state.yearMonth, draft.day);
    await this.mutate(async () => {
      await source.updateTransaction(transactionId, {
        categoryId: draft.categoryId,
        item: draft.item.trim(),
        amount: draft.amount,
        date,
        ...(draft.note ? { note: draft.note } : {}),
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

  async addCategory(name: string, type: CategoryType, allocation = 0): Promise<void> {
    const source = this.source;
    if (!source) return;

    const trimmed = name.trim();
    const { categories, yearMonth, budget } = this.state;
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

  async addIncome(name: string, amount: number, note?: string): Promise<void> {
    const trimmed = name.trim();
    // Name and amount are both required; the forms disable their submit, but
    // the rule belongs here too so it holds for every caller.
    if (!trimmed || amount <= 0) return;
    const income: Income = {
      id: newIncomeId(),
      name: trimmed,
      amount,
      ...(note?.trim() ? { note: note.trim() } : {}),
    };
    await this.writeIncomes([...this.budgetBase().incomes, income], `${trimmed} added`);
  }

  async updateIncome(
    incomeId: string,
    patch: { name?: string; amount?: number; note?: string },
  ): Promise<void> {
    const incomes = this.budgetBase().incomes;
    const current = incomes.find((i) => i.id === incomeId);
    if (!current) return;

    const name = patch.name === undefined ? current.name : patch.name.trim();
    const amount = patch.amount === undefined ? current.amount : patch.amount;
    const rawNote = patch.note === undefined ? current.note : patch.note.trim();
    if (!name) return;

    const next: Income = {
      id: current.id,
      name,
      amount,
      // Kept optional rather than stored as "": an empty note is no note, and
      // Firestore would otherwise hold an empty string forever.
      ...(rawNote ? { note: rawNote } : {}),
    };
    await this.writeIncomes(
      incomes.map((i) => (i.id === incomeId ? next : i)),
      `${name} updated`,
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
let incomeSeq = 0;
const newIncomeId = (): string =>
  `income-${Date.now().toString(36)}-${(++incomeSeq).toString(36)}`;

/** The calendar year of the month in view — the yearly tab's scope. */
export const yearInView = (state: ExpenseState): string => yearOfMonth(state.yearMonth);

/** True when the month in view is the current one. */
export const isCurrentMonth = (state: ExpenseState): boolean =>
  state.yearMonth === state.today.slice(0, 7);

export const currentYearOf = (state: ExpenseState): string => toYear(state.today);
