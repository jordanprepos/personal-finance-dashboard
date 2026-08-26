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

/**
 * One interface, two implementations: live Firestore, and an in-memory seed
 * used when no Firebase config is present. Both apps talk only to this, so
 * the demo path exercises exactly the same call sites as the real one.
 */
export interface ExpenseDataSource {
  readonly kind: 'firestore' | 'seed';
  readonly userId: string;

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
