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
import type { CarryOverResult } from '../lib/carryOver.js';
import type { SeriesExtendResult, SeriesExtendWindow } from '../lib/queries.js';

/** What a category delete removed, kept so it can be undone. */
export interface DeletedCategory {
  /** the category document as stored — not name-corrected, not recoloured */
  category: Category;
  transactions: Transaction[];
}

/** Tears down a subscription. Safe to call more than once. */
export type Unsubscribe = () => void;

/**
 * Everything the Monthly view renders, delivered together so a subscriber
 * never paints a half-updated month.
 */
export interface MonthSnapshot {
  /** every account, in `order` — balances are projected from these by `lib/accounts.ts` */
  accounts: Account[];
  categories: Category[];
  monthTransactions: Transaction[];
  yearTransactions: Transaction[];
  /**
   * Whether the account holds any transaction in any period — the one fact
   * about history beyond the year in view. `yearTransactions` is empty on the
   * first period of every new year, so "has ever logged an expense" cannot be
   * read from it.
   */
  hasTransactions: boolean;
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
   * Live view of one tracking period. Calls `onChange` with the whole snapshot
   * on every change from any client, and keeps calling until the returned
   * function runs.
   *
   * `yearMonth` is the period id and `cycleStartDay` says how wide it is: `1`
   * makes it the calendar month, anything higher a salary-to-salary window
   * ending in that month. Both are needed — the id alone does not say which
   * dates it covers.
   *
   * The Firestore implementation fans out to seven listeners and emits only
   * once all seven have reported, so the first callback is a complete month
   * rather than seven partial repaints. The seed implementation re-emits after
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
    cycleStartDay: number,
    onChange: (snapshot: MonthSnapshot) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  createAccount(input: AccountInput): Promise<Account>;
  updateAccount(accountId: string, patch: AccountPatch): Promise<void>;
  /**
   * Confirms what an account holds, as of a date. Its own call rather than a
   * two-field patch: the pair is meaningless apart, since a balance with no
   * date attached cannot be projected from.
   */
  reconcileAccount(accountId: string, balance: number, asOf: string): Promise<void>;
  /**
   * Hard delete. Transactions naming the account are left alone — `accountId`
   * is omitted-when-unset, so a stale id already reads as unattributed.
   */
  deleteAccount(accountId: string): Promise<void>;

  createCategory(input: CategoryInput): Promise<Category>;
  /**
   * Hard delete — also removes every transaction in the category, in every
   * year. Returns what was removed, the category as stored, so undo can put
   * it back with `restoreCategory` and `restoreTransactions`.
   */
  deleteCategory(categoryId: string): Promise<DeletedCategory>;
  /** Writes a deleted category back under its own id. */
  restoreCategory(category: Category): Promise<void>;

  createTransaction(input: TransactionInput): Promise<Transaction>;
  /** One document per month, from `input.date` through `throughYearMonth`. */
  createTransactionSeries(input: TransactionInput, throughYearMonth: string): Promise<Transaction[]>;
  updateTransaction(transactionId: string, patch: TransactionPatch): Promise<void>;
  /**
   * No read first: undo restores the snapshot's own row, which came through
   * the same `toTransaction` mapper, so a round trip before the delete would
   * buy nothing and delay latency compensation on the commonest delete.
   */
  deleteTransaction(transactionId: string): Promise<void>;
  /**
   * Continues a run past its last entry, under its own `seriesId`, within
   * `window` — never into a period before today's, never into a gap, and
   * nothing at all when the run already reaches the target. The plan is
   * `queries.seriesExtension`, shared by both implementations.
   */
  extendTransactionSeries(seriesId: string, window: SeriesExtendWindow): Promise<SeriesExtendResult>;
  /**
   * "This and future months" — matches on `seriesId` and `date >= fromDate`.
   * Returns the rows removed, including any beyond the year in view.
   */
  deleteTransactionSeries(key: TransactionSeriesKey): Promise<Transaction[]>;
  /**
   * Writes deleted rows back under their original ids — undo for the deletes
   * above. Ids already present are left as they are, so a repeat adds nothing.
   */
  restoreTransactions(rows: readonly Transaction[]): Promise<void>;

  saveBudget(budget: Budget): Promise<void>;
  /**
   * Replaces one month's income sources; the rest of the budget is kept.
   * Add, edit and delete are all this one call — the list is written whole.
   */
  setIncomes(yearMonth: string, incomes: Income[]): Promise<void>;
  /** Alert settings are per account, not per month — they live on the profile. */
  setAlerts(alerts: AlertSettings): Promise<void>;
  /** The tracking cycle's start day — per account, on the profile like alerts. */
  setCycleStartDay(cycleStartDay: number): Promise<void>;
  /**
   * The dashboard card list — per account, on the profile like alerts. Written
   * whole for the same reason `setIncomes` is: an array cannot be merged
   * element-wise, so add, remove and reorder are one call.
   */
  setDashboardCards(cards: readonly string[]): Promise<void>;
  /** Read-modify-write of one category's allocation for one month. */
  setCategoryBudget(yearMonth: string, categoryId: string, amount: number): Promise<void>;
  /**
   * Fills the month's empty income list and unset allocations from the latest
   * earlier months that hold them — a write that reads first, like the two above,
   * not a read path. Only `categoryIds` are carried. Never overwrites; the
   * rules are `lib/carryOver.ts`'s, shared by both implementations.
   */
  carryOverBudget(yearMonth: string, categoryIds: readonly string[]): Promise<CarryOverResult>;
}
