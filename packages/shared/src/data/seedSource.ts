import { Timestamp } from 'firebase/firestore';

import { seriesDates } from '../lib/queries.js';
import { toYear, toYearMonth } from '../lib/dates.js';
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
import type { ExpenseDataSource } from './source.js';

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

  return {
    kind: 'seed',
    userId,

    async listCategories(): Promise<Category[]> {
      return clone(categories).sort((a, b) => a.order - b.order);
    },

    async createCategory(input: CategoryInput): Promise<Category> {
      const category: Category = { ...input, id: `cat-${Date.now().toString(36)}` };
      categories = [...categories, category];
      return { ...category };
    },

    async deleteCategory(categoryId: string): Promise<number> {
      const removed = transactions.filter((t) => t.categoryId === categoryId).length;
      transactions = transactions.filter((t) => t.categoryId !== categoryId);
      categories = categories.filter((c) => c.id !== categoryId);
      return removed;
    },

    async listTransactionsByDate(date: string): Promise<Transaction[]> {
      return clone(transactions.filter((t) => t.date === date));
    },

    async listTransactionsByMonth(yearMonth: string): Promise<Transaction[]> {
      return clone(transactions.filter((t) => t.yearMonth === yearMonth)).sort(byDateDesc);
    },

    async listTransactionsByYear(year: string): Promise<Transaction[]> {
      return clone(transactions.filter((t) => t.year === year)).sort(byDateDesc);
    },

    async createTransaction(input: TransactionInput): Promise<Transaction> {
      const created = build(input);
      transactions = [...transactions, created];
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
    },

    async deleteTransaction(transactionId: string): Promise<void> {
      transactions = transactions.filter((t) => t.id !== transactionId);
    },

    async deleteTransactionSeries(key: TransactionSeriesKey): Promise<number> {
      const matches = (t: Transaction): boolean =>
        t.seriesId === key.seriesId && t.date >= key.fromDate;
      const removed = transactions.filter(matches).length;
      transactions = transactions.filter((t) => !matches(t));
      return removed;
    },

    async getBudget(yearMonth: string): Promise<Budget> {
      const budget = budgets[yearMonth];
      return budget
        ? { ...budget, categoryBudgets: { ...budget.categoryBudgets } }
        : { id: yearMonth, income: SEED_INCOME, categoryBudgets: {} };
    },

    async saveBudget(budget: Budget): Promise<void> {
      budgets[budget.id] = { ...budget, categoryBudgets: { ...budget.categoryBudgets } };
    },

    async getProfile(): Promise<Profile> {
      return { ...profile };
    },
  };
}
