import type { Firestore } from 'firebase/firestore';

import * as q from '../lib/queries.js';
import type {
  Account,
  AccountInput,
  AccountPatch,
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
import { cycleRange, yearOfMonth, yearMonthOf } from '../lib/dates.js';
import type { ExpenseDataSource, MonthSnapshot, Unsubscribe } from './source.js';

/** Live Firestore, scoped to one authenticated user. */
export function createFirestoreDataSource(db: Firestore, userId: string): ExpenseDataSource {
  return {
    kind: 'firestore',
    userId,

    watchMonth: (
      yearMonth: string,
      cycleStartDay: number,
      onChange: (snapshot: MonthSnapshot) => void,
      onError: (error: Error) => void,
    ): Unsubscribe => watchMonth(db, userId, yearMonth, cycleStartDay, onChange, onError),

    createAccount: (input: AccountInput): Promise<Account> => q.createAccount(db, userId, input),
    updateAccount: (accountId: string, patch: AccountPatch): Promise<void> =>
      q.updateAccount(db, userId, accountId, patch),
    reconcileAccount: (accountId: string, balance: number, asOf: string): Promise<void> =>
      q.reconcileAccount(db, userId, accountId, balance, asOf),
    deleteAccount: (accountId: string): Promise<void> => q.deleteAccount(db, userId, accountId),

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
    setCycleStartDay: (cycleStartDay: number): Promise<void> =>
      q.saveCycleStartDay(db, userId, cycleStartDay),
    setDashboardCards: (cards: readonly string[]): Promise<void> =>
      q.saveDashboardCards(db, userId, cards),
    setCategoryBudget: (yearMonth: string, categoryId: string, amount: number): Promise<void> =>
      q.setCategoryBudget(db, userId, yearMonth, categoryId, amount),
  };
}

/**
 * Fans one period out to the six listeners the dashboard needs, and gates the
 * callback until each has reported at least once.
 *
 * Two of the six are windowed by `cycleStartDay` rather than by the period id
 * — the period's own transactions, and the twelve periods of the year around
 * it. The other four (accounts, categories, the budget document, the profile)
 * are keyed by id or account and are unaffected by how wide a period is.
 *
 * Without that gate the first paint would arrive in six pieces — categories
 * with no transactions, then transactions with no budget — and each piece
 * would render. After the gate opens every later change emits immediately,
 * since by then only one part is actually changing.
 *
 * The first error wins and stops the flow: a partial month is worse than a
 * visible failure, and in practice all six fail together (they share one
 * rules path).
 */
function watchMonth(
  db: Firestore,
  userId: string,
  yearMonth: string,
  cycleStartDay: number,
  onChange: (snapshot: MonthSnapshot) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const unsubscribes: Unsubscribe[] = [];
  let failed = false;

  /**
   * Registers each listener the moment it exists.
   *
   * Passing all six to one `push(...)` would evaluate every argument before
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
   * — they also let TypeScript narrow, so no casts are needed. Once all six
   * are set the condition stays false and every later change emits straight
   * through.
   */
  const emit = (): void => {
    if (failed) return;
    const { accounts, categories, monthTransactions, yearTransactions, budget, profile } = parts;
    if (
      accounts === undefined ||
      categories === undefined ||
      monthTransactions === undefined ||
      yearTransactions === undefined ||
      budget === undefined ||
      profile === undefined
    ) {
      return;
    }
    onChange({ accounts, categories, monthTransactions, yearTransactions, budget, profile });
  };

  const fail = (error: Error): void => {
    if (failed) return;
    failed = true;
    stop();
    onError(error);
  };

  try {
    track(
      q.watchAccounts(
        db,
        userId,
        (accounts) => {
          parts.accounts = accounts;
          emit();
        },
        fail,
      ),
    );
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
    const period = cycleRange(yearMonth, cycleStartDay);
    track(
      q.watchTransactionsInRange(
        db,
        userId,
        period.start,
        period.end,
        (rows) => {
          parts.monthTransactions = rows;
          emit();
        },
        fail,
      ),
    );
    // The year is the twelve periods labelled by that year's months, which at
    // any start day above 1 reaches back into the previous December.
    const year = Number(yearOfMonth(yearMonth));
    const yearStart = cycleRange(yearMonthOf(year, 1), cycleStartDay).start;
    const yearEnd = cycleRange(yearMonthOf(year, 12), cycleStartDay).end;
    track(
      q.watchTransactionsInRange(
        db,
        userId,
        yearStart,
        yearEnd,
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
