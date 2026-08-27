import type { EnvRecord } from './firebase.js';
import { resolveSession, type ExpenseDataSource } from './data/index.js';
import { currentYearMonth, dateInMonth, todayISO, toYear, yearOfMonth } from './lib/dates.js';
import type { Budget, Category, CategoryType, Profile, Transaction } from './types.js';
import { DEFAULT_PROFILE } from './lib/queries.js';

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
  profile: DEFAULT_PROFILE,
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
      await this.reloadFor(generation);
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
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = null;
    this.source = null;
    this.state = initialState(this.state.yearMonth, this.state.today);
    for (const listener of this.listeners) listener();
  }

  /** Re-reads the month, the year and the categories for `yearMonth`. */
  async reload(): Promise<void> {
    await this.reloadFor(this.generation);
  }

  /** `reload`, pinned to the generation the caller started under. */
  private async reloadFor(generation: number): Promise<void> {
    const source = this.source;
    if (!source) return;

    const { yearMonth } = this.state;
    const year = yearOfMonth(yearMonth);

    try {
      const [categories, monthTransactions, yearTransactions, budget, profile] = await Promise.all([
        source.listCategories(),
        source.listTransactionsByMonth(yearMonth),
        source.listTransactionsByYear(year),
        source.getBudget(yearMonth),
        source.getProfile(),
      ]);
      if (generation !== this.generation) return;
      this.set({
        status: 'ready',
        error: null,
        categories,
        monthTransactions,
        yearTransactions,
        budget,
        profile,
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.set({ status: 'error', error: message(error) });
    }
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

  private async mutate(work: () => Promise<string>): Promise<void> {
    if (!this.source) return;
    const generation = this.generation;
    this.set({ busy: true });
    try {
      const note = await work();
      if (generation !== this.generation) return;
      await this.reloadFor(generation);
      if (generation !== this.generation) return;
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
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      this.showToast(`${trimmed} already exists`);
      return;
    }

    await this.mutate(async () => {
      const created = await source.createCategory({
        name: trimmed,
        type,
        color: nextColor(categories),
        icon: '',
        order: categories.length,
        archived: false,
      });
      if (allocation > 0) {
        const base: Budget = budget ?? { id: yearMonth, income: 0, categoryBudgets: {} };
        await source.saveBudget({
          ...base,
          categoryBudgets: { ...base.categoryBudgets, [created.id]: allocation },
        });
      }
      return `${trimmed} added as a ${type} category`;
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

  async setIncome(income: number): Promise<void> {
    const source = this.source;
    if (!source) return;
    const { yearMonth, budget } = this.state;
    await this.mutate(async () => {
      const base: Budget = budget ?? { id: yearMonth, income: 0, categoryBudgets: {} };
      await source.saveBudget({ ...base, income });
      return 'Income updated';
    });
  }

  async setCategoryBudget(categoryId: string, amount: number): Promise<void> {
    const source = this.source;
    if (!source) return;
    const { yearMonth, budget } = this.state;
    await this.mutate(async () => {
      const base: Budget = budget ?? { id: yearMonth, income: 0, categoryBudgets: {} };
      await source.saveBudget({
        ...base,
        categoryBudgets: { ...base.categoryBudgets, [categoryId]: amount },
      });
      return 'Allocation updated';
    });
  }
}

const RAMP = ['#1157d9', '#182338', '#5f6c85', '#c9d6ee', '#8b98ae'];

const nextColor = (categories: readonly Category[]): string =>
  RAMP[categories.length % RAMP.length] as string;

/** The calendar year of the month in view — the yearly tab's scope. */
export const yearInView = (state: ExpenseState): string => yearOfMonth(state.yearMonth);

/** True when the month in view is the current one. */
export const isCurrentMonth = (state: ExpenseState): boolean =>
  state.yearMonth === state.today.slice(0, 7);

export const currentYearOf = (state: ExpenseState): string => toYear(state.today);
