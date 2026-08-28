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

/** Tears down a subscription. Safe to call more than once. */
export type Unsubscribe = () => void;

/**
 * Everything the Monthly view renders, delivered together so a subscriber
 * never paints a half-updated month.
 */
export interface MonthSnapshot {
  categories: Category[];
  monthTransactions: Transaction[];
  yearTransactions: Transaction[];
  budget: Budget;
  profile: Profile;
}

/**
 * One interface, two implementations: live Firestore, and an in-memory seed
 * used when no Firebase config is present. Both apps talk only to this, so
 * the demo path exercises exactly the same call sites as the real one.
 */
export interface ExpenseDataSource {
  readonly kind: 'firestore' | 'seed';
  readonly userId: string;

  /**
   * Live view of one month. Calls `onChange` with the whole snapshot on every
   * change from any client, and keeps calling until the returned function runs.
   *
   * The Firestore implementation fans out to five listeners and emits only
   * once all five have reported, so the first callback is a complete month
   * rather than five partial repaints. The seed implementation re-emits after
   * every write, so demo mode behaves the same way rather than going stale
   * after the first paint.
   *
   * This is the **only** read path. Reads used to be six one-shot methods on
   * this interface; every view now renders from the pushed snapshot, so they
   * were removed rather than left to rot in three places. `queries.fetch*`
   * remains exported for a genuinely one-off read.
   */
  watchMonth(
    yearMonth: string,
    onChange: (snapshot: MonthSnapshot) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  createCategory(input: CategoryInput): Promise<Category>;
  /** Hard delete — also removes every transaction in the category. Returns that count. */
  deleteCategory(categoryId: string): Promise<number>;

  createTransaction(input: TransactionInput): Promise<Transaction>;
  /** One document per month, from `input.date` through `throughYearMonth`. */
  createTransactionSeries(input: TransactionInput, throughYearMonth: string): Promise<Transaction[]>;
  updateTransaction(transactionId: string, patch: TransactionPatch): Promise<void>;
  deleteTransaction(transactionId: string): Promise<void>;
  /** "This and future months" — matches on categoryId + item + date >= fromDate. */
  deleteTransactionSeries(key: TransactionSeriesKey): Promise<number>;

  saveBudget(budget: Budget): Promise<void>;
  /**
   * Replaces one month's income sources; the rest of the budget is kept.
   * Add, edit and delete are all this one call — the list is written whole.
   */
  setIncomes(yearMonth: string, incomes: Income[]): Promise<void>;
  /** Alert settings are per account, not per month — they live on the profile. */
  setAlerts(alerts: AlertSettings): Promise<void>;
  /** Read-modify-write of one category's allocation for one month. */
  setCategoryBudget(yearMonth: string, categoryId: string, amount: number): Promise<void>;
}
