import type { Firestore } from 'firebase/firestore';

import * as q from '../lib/queries.js';
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
import { yearOfMonth } from '../lib/dates.js';
import type { ExpenseDataSource, MonthSnapshot, Unsubscribe } from './source.js';

/** Live Firestore, scoped to one authenticated user. */
export function createFirestoreDataSource(db: Firestore, userId: string): ExpenseDataSource {
  return {
    kind: 'firestore',
    userId,

    watchMonth: (
      yearMonth: string,
      onChange: (snapshot: MonthSnapshot) => void,
      onError: (error: Error) => void,
    ): Unsubscribe => watchMonth(db, userId, yearMonth, onChange, onError),

    listCategories: (): Promise<Category[]> => q.fetchCategories(db, userId),
    createCategory: (input: CategoryInput): Promise<Category> => q.createCategory(db, userId, input),
    deleteCategory: (categoryId: string): Promise<number> => q.deleteCategory(db, userId, categoryId),

    listTransactionsByDate: (date: string): Promise<Transaction[]> =>
      q.fetchTransactionsByDate(db, userId, date),
    listTransactionsByMonth: (yearMonth: string): Promise<Transaction[]> =>
      q.fetchTransactionsByMonth(db, userId, yearMonth),
    listTransactionsByYear: (year: string): Promise<Transaction[]> =>
      q.fetchTransactionsByYear(db, userId, year),

    createTransaction: (input: TransactionInput): Promise<Transaction> =>
      q.createTransaction(db, userId, input),
    createTransactionSeries: (input: TransactionInput, through: string): Promise<Transaction[]> =>
      q.createTransactionSeries(db, userId, input, through),
    updateTransaction: (id: string, patch: TransactionPatch): Promise<void> =>
      q.updateTransaction(db, userId, id, patch),
    deleteTransaction: (id: string): Promise<void> => q.deleteTransaction(db, userId, id),
    deleteTransactionSeries: (key: TransactionSeriesKey): Promise<number> =>
      q.deleteTransactionSeries(db, userId, key),

    getBudget: (yearMonth: string): Promise<Budget> => q.fetchBudget(db, userId, yearMonth),
    saveBudget: (budget: Budget): Promise<void> => q.saveBudget(db, userId, budget),

    getProfile: (): Promise<Profile> => q.fetchProfile(db, userId),
  };
}

/**
 * Fans one month out to the five listeners the Monthly view needs, and gates
 * the callback until each has reported at least once.
 *
 * Without that gate the first paint would arrive in five pieces — categories
 * with no transactions, then transactions with no budget — and each piece
 * would render. After the gate opens every later change emits immediately,
 * since by then only one part is actually changing.
 *
 * The first error wins and stops the flow: a partial month is worse than a
 * visible failure, and in practice all five fail together (they share one
 * rules path).
 */
function watchMonth(
  db: Firestore,
  userId: string,
  yearMonth: string,
  onChange: (snapshot: MonthSnapshot) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  // `let` + push, not a const array literal: `fail` can run during setup, and
  // it calls stop() — which must see whatever has been subscribed so far.
  const unsubscribes: Unsubscribe[] = [];
  let failed = false;

  const parts: Partial<MonthSnapshot> = {};

  const stop = (): void => {
    while (unsubscribes.length > 0) unsubscribes.pop()?.();
  };

  /**
   * Emits only once every part has arrived. The undefined checks are the gate
   * — they also let TypeScript narrow, so no casts are needed. Once all five
   * are set the condition stays false and every later change emits straight
   * through.
   */
  const emit = (): void => {
    if (failed) return;
    const { categories, monthTransactions, yearTransactions, budget, profile } = parts;
    if (
      categories === undefined ||
      monthTransactions === undefined ||
      yearTransactions === undefined ||
      budget === undefined ||
      profile === undefined
    ) {
      return;
    }
    onChange({ categories, monthTransactions, yearTransactions, budget, profile });
  };

  const fail = (error: Error): void => {
    if (failed) return;
    failed = true;
    stop();
    onError(error);
  };

  unsubscribes.push(
    q.watchCategories(
      db,
      userId,
      (categories) => {
        parts.categories = categories;
        emit();
      },
      fail,
    ),
    q.watchTransactionsByMonth(
      db,
      userId,
      yearMonth,
      (rows) => {
        parts.monthTransactions = rows;
        emit();
      },
      fail,
    ),
    q.watchTransactionsByYear(
      db,
      userId,
      yearOfMonth(yearMonth),
      (rows) => {
        parts.yearTransactions = rows;
        emit();
      },
      fail,
    ),
    q.watchBudget(
      db,
      userId,
      yearMonth,
      (budget) => {
        parts.budget = budget;
        emit();
      },
      fail,
    ),
    q.watchProfile(
      db,
      userId,
      (profile) => {
        parts.profile = profile;
        emit();
      },
      fail,
    ),
  );

  // A synchronous failure during setup already tore down what existed then;
  // anything pushed after that would leak, so sweep again.
  if (failed) stop();

  return stop;
}
