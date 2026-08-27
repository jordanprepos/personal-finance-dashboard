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
   * rather than five partial repaints. The seed implementation emits once and
   * never again — there is nothing to observe in memory.
   */
  watchMonth(
    yearMonth: string,
    onChange: (snapshot: MonthSnapshot) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  listCategories(): Promise<Category[]>;
  createCategory(input: CategoryInput): Promise<Category>;
  /** Hard delete — also removes every transaction in the category. Returns that count. */
  deleteCategory(categoryId: string): Promise<number>;

  /** Equality query on the denormalized `date`. */
  listTransactionsByDate(date: string): Promise<Transaction[]>;
  /** Equality query on the denormalized `yearMonth`. */
  listTransactionsByMonth(yearMonth: string): Promise<Transaction[]>;
  /** Equality query on the denormalized `year`. */
  listTransactionsByYear(year: string): Promise<Transaction[]>;

  createTransaction(input: TransactionInput): Promise<Transaction>;
  /** One document per month, from `input.date` through `throughYearMonth`. */
  createTransactionSeries(input: TransactionInput, throughYearMonth: string): Promise<Transaction[]>;
  updateTransaction(transactionId: string, patch: TransactionPatch): Promise<void>;
  deleteTransaction(transactionId: string): Promise<void>;
  /** "This and future months" — matches on categoryId + item + date >= fromDate. */
  deleteTransactionSeries(key: TransactionSeriesKey): Promise<number>;

  getBudget(yearMonth: string): Promise<Budget>;
  saveBudget(budget: Budget): Promise<void>;

  getProfile(): Promise<Profile>;
}
