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

  async init(env: EnvRecord | undefined): Promise<void> {
    try {
      const session = await resolveSession(env);
      this.source = session.source;
      this.set({
        mode: session.mode,
        userId: session.userId,
        warning: session.warning ?? null,
      });
      await this.reload();
    } catch (error) {
      this.set({ status: 'error', error: message(error) });
    }
  }

  /** Re-reads the month, the year and the categories for `yearMonth`. */
  async reload(): Promise<void> {
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
    this.set({ busy: true });
    try {
      const note = await work();
      await this.reload();
      this.showToast(note);
    } catch (error) {
      this.set({ error: message(error) });
      this.showToast(`Could not save — ${message(error)}`);
    } finally {
      this.set({ busy: false });
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
