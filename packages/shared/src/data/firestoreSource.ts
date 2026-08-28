import type { Firestore } from 'firebase/firestore';

import * as q from '../lib/queries.js';
import type {
  AlertSettings,
  Budget,
  Category,
  CategoryInput,
  Income,
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

    createCategory: (input: CategoryInput): Promise<Category> => q.createCategory(db, userId, input),
    deleteCategory: (categoryId: string): Promise<number> => q.deleteCategory(db, userId, categoryId),

    createTransaction: (input: TransactionInput): Promise<Transaction> =>
      q.createTransaction(db, userId, input),
    createTransactionSeries: (input: TransactionInput, through: string): Promise<Transaction[]> =>
      q.createTransactionSeries(db, userId, input, through),
    updateTransaction: (id: string, patch: TransactionPatch): Promise<void> =>
      q.updateTransaction(db, userId, id, patch),
    deleteTransaction: (id: string): Promise<void> => q.deleteTransaction(db, userId, id),
    deleteTransactionSeries: (key: TransactionSeriesKey): Promise<number> =>
      q.deleteTransactionSeries(db, userId, key),

    saveBudget: (budget: Budget): Promise<void> => q.saveBudget(db, userId, budget),
    setIncomes: (yearMonth: string, incomes: Income[]): Promise<void> =>
      q.setIncomes(db, userId, yearMonth, incomes),
    setAlerts: (alerts: AlertSettings): Promise<void> => q.saveAlerts(db, userId, alerts),
    setCategoryBudget: (yearMonth: string, categoryId: string, amount: number): Promise<void> =>
      q.setCategoryBudget(db, userId, yearMonth, categoryId, amount),
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
  const unsubscribes: Unsubscribe[] = [];
  let failed = false;

  /**
   * Registers each listener the moment it exists.
   *
   * Passing all five to one `push(...)` would evaluate every argument before
   * pushing any, leaving `unsubscribes` empty for the whole of setup — so a
   * listener that threw partway (`assertYearMonth` on a malformed
   * `yearMonth`, say) would strand the ones already registered, with the
   * exception unwinding past any cleanup below.
   */
  const track = (unsubscribe: Unsubscribe): void => {
    unsubscribes.push(unsubscribe);
  };

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

  try {
    track(
      q.watchCategories(
        db,
        userId,
        (categories) => {
          parts.categories = categories;
          emit();
        },
        fail,
      ),
    );
    track(
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
    );
    track(
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
    );
    track(
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
    );
    track(
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
  } catch (error) {
    // The caller never receives an unsubscribe when setup throws, so nothing
    // else can ever tear these down.
    stop();
    throw error;
  }

  // A synchronous `fail` during setup tore down only what existed at that
  // moment; anything registered after it would otherwise leak.
  if (failed) stop();

  return stop;
}
