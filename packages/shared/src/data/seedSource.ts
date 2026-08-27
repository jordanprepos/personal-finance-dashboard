import { Timestamp } from 'firebase/firestore';

import { seriesDates } from '../lib/queries.js';
import { toYear, toYearMonth, yearOfMonth } from '../lib/dates.js';
import type {
  Budget,
  Category,
  CategoryInput,
  Profile,
  Transaction,
  TransactionInput,
  TransactionPatch,
  TransactionSeriesKey,
} from '../types.js';
import { seedBudgets, seedCategories, seedProfile, seedTransactions, SEED_INCOME } from './seedData.js';
import type { ExpenseDataSource, MonthSnapshot, Unsubscribe } from './source.js';

/**
 * In-memory stand-in for Firestore. Same interface, same denormalization
 * rules, same equality-query semantics — it just holds the rows in an array
 * so the apps run before a Firebase project exists. State lives for the
 * lifetime of the page.
 */
export function createSeedDataSource(userId = 'demo-user'): ExpenseDataSource {
  let categories = seedCategories();
  let transactions = seedTransactions();
  const budgets = seedBudgets();
  const profile = seedProfile();
  let nextId = transactions.length + 1;

  const newId = (): string => `seed-${String(++nextId).padStart(4, '0')}`;
  let nextCategory = 0;
  /* Monotonic, like `newId`. A clock-based id collides when several
     categories are created in the same millisecond — which bulk-adding the
     defaults does every time, silently giving them all one id. */
  const newCategoryId = (): string => `cat-${String(++nextCategory).padStart(3, '0')}`;
  let nextSeries = 0;
  const newSeriesId = (): string => `seed-series-${String(++nextSeries).padStart(3, '0')}`;
  const clone = <T>(rows: T[]): T[] => rows.map((r) => ({ ...r }));
  const byDateDesc = (a: Transaction, b: Transaction): number => b.date.localeCompare(a.date);

  const build = (input: TransactionInput, seriesId: string | null = null): Transaction => ({
    id: newId(),
    categoryId: input.categoryId,
    item: input.item,
    amount: input.amount,
    date: input.date,
    yearMonth: toYearMonth(input.date),
    year: toYear(input.date),
    ...(input.note ? { note: input.note } : {}),
    seriesId,
    createdAt: Timestamp.now(),
  });

  /* The reads, as plain closures. The interface methods and the watch
     snapshot both go through these, so a live subscriber and a one-shot
     caller can never disagree about what the month contains. */
  const readCategories = (): Category[] => clone(categories).sort((a, b) => a.order - b.order);
  const readMonth = (yearMonth: string): Transaction[] =>
    clone(transactions.filter((t) => t.yearMonth === yearMonth)).sort(byDateDesc);
  const readYear = (year: string): Transaction[] =>
    clone(transactions.filter((t) => t.year === year)).sort(byDateDesc);
  const readBudget = (yearMonth: string): Budget => {
    const budget = budgets[yearMonth];
    return budget
      ? { ...budget, categoryBudgets: { ...budget.categoryBudgets } }
      : { id: yearMonth, income: SEED_INCOME, categoryBudgets: {} };
  };
  const monthSnapshot = (yearMonth: string): MonthSnapshot => ({
    categories: readCategories(),
    monthTransactions: readMonth(yearMonth),
    yearTransactions: readYear(yearOfMonth(yearMonth)),
    budget: readBudget(yearMonth),
    profile: { ...profile },
  });

  /* Live subscribers. The seed source is the only thing that mutates these
     arrays, so it can notify precisely: every write re-emits to everyone
     watching, which is what makes demo mode behave like the Firestore path
     instead of quietly going stale after the first paint. */
  interface Watcher {
    yearMonth: string;
    onChange: (snapshot: MonthSnapshot) => void;
    live: boolean;
  }
  const watchers = new Set<Watcher>();
  const notify = (): void => {
    for (const watcher of watchers) {
      if (watcher.live) watcher.onChange(monthSnapshot(watcher.yearMonth));
    }
  };

  return {
    kind: 'seed',
    userId,

    /**
     * Emits the month now and again after every write, for as long as the
     * subscription lives. The first emit is deferred to a microtask so
     * subscribers see the same "never fires during subscribe" ordering
     * Firestore gives them — a callback that ran synchronously here would
     * reach the store before it had finished wiring the subscription up.
     */
    watchMonth(yearMonth, onChange): Unsubscribe {
      const watcher: Watcher = { yearMonth, onChange, live: true };
      watchers.add(watcher);
      void Promise.resolve().then(() => {
        if (watcher.live) watcher.onChange(monthSnapshot(yearMonth));
      });
      return () => {
        watcher.live = false;
        watchers.delete(watcher);
      };
    },

    async listCategories(): Promise<Category[]> {
      return readCategories();
    },

    async createCategory(input: CategoryInput): Promise<Category> {
      const category: Category = { ...input, id: newCategoryId() };
      categories = [...categories, category];
      notify();
      return { ...category };
    },

    async deleteCategory(categoryId: string): Promise<number> {
      const removed = transactions.filter((t) => t.categoryId === categoryId).length;
      transactions = transactions.filter((t) => t.categoryId !== categoryId);
      categories = categories.filter((c) => c.id !== categoryId);
      notify();
      return removed;
    },

    async listTransactionsByDate(date: string): Promise<Transaction[]> {
      return clone(transactions.filter((t) => t.date === date));
    },

    async listTransactionsByMonth(yearMonth: string): Promise<Transaction[]> {
      return readMonth(yearMonth);
    },

    async listTransactionsByYear(year: string): Promise<Transaction[]> {
      return readYear(year);
    },

    async createTransaction(input: TransactionInput): Promise<Transaction> {
      const created = build(input);
      transactions = [...transactions, created];
      notify();
      return { ...created };
    },

    async createTransactionSeries(
      input: TransactionInput,
      throughYearMonth: string,
    ): Promise<Transaction[]> {
      const seriesId = newSeriesId();
      const created = seriesDates(input.date, throughYearMonth).map((date) =>
        build({ ...input, date }, seriesId),
      );
      transactions = [...transactions, ...created];
      notify();
      return clone(created);
    },

    async updateTransaction(transactionId: string, patch: TransactionPatch): Promise<void> {
      transactions = transactions.map((t) => {
        if (t.id !== transactionId) return t;
        const next: Transaction = { ...t, ...patch };
        if (patch.date !== undefined) {
          next.yearMonth = toYearMonth(patch.date);
          next.year = toYear(patch.date);
        }
        return next;
      });
      notify();
    },

    async deleteTransaction(transactionId: string): Promise<void> {
      transactions = transactions.filter((t) => t.id !== transactionId);
      notify();
    },

    async deleteTransactionSeries(key: TransactionSeriesKey): Promise<number> {
      const matches = (t: Transaction): boolean =>
        t.seriesId === key.seriesId && t.date >= key.fromDate;
      const removed = transactions.filter(matches).length;
      transactions = transactions.filter((t) => !matches(t));
      notify();
      return removed;
    },

    async getBudget(yearMonth: string): Promise<Budget> {
      return readBudget(yearMonth);
    },

    async saveBudget(budget: Budget): Promise<void> {
      budgets[budget.id] = { ...budget, categoryBudgets: { ...budget.categoryBudgets } };
      notify();
    },

    async getProfile(): Promise<Profile> {
      return { ...profile };
    },
  };
}
