import type { Timestamp } from 'firebase/firestore';

/**
 * Firestore data model.
 *
 *   users/{userId}
 *     ├── categories/{categoryId}
 *     ├── transactions/{transactionId}
 *     ├── budgets/{yearMonth}       // doc id "2026-08"
 *     └── profile/main              // single doc
 *
 * Field names here are load-bearing: dashboard queries are written against
 * them. Do not rename without updating firestore.indexes.json too.
 *
 * A transaction carries two independent dimensions: `categoryId` (what the
 * expense is for) and `paymentMethod` (how it was paid). Neither is ever
 * derived from the other.
 */

export type CategoryType = 'fixed' | 'variable' | 'savings';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  /** hex, e.g. "#1157d9" */
  color: string;
  icon: string;
  order: number;
  archived: boolean;
}

/**
 * How an expense was paid — a dimension of its own, independent of
 * `categoryId`. See the note on `Transaction.paymentMethod`.
 */
export type PaymentMethod = 'credit_card' | 'bank_transfer' | 'e_wallet' | 'cash' | 'other';

/** Menu order for the payment-method selector — both apps read this list. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'credit_card',
  'bank_transfer',
  'e_wallet',
  'cash',
  'other',
];

/** Display labels, so both apps render identical option text. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  credit_card: 'Credit card',
  bank_transfer: 'Bank transfer',
  e_wallet: 'E-wallet',
  cash: 'Cash',
  other: 'Other',
};

/** Narrows an arbitrary stored value to the union; anything else reads as unset. */
export const isPaymentMethod = (value: unknown): value is PaymentMethod =>
  typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);

export interface Transaction {
  id: string;
  /**
   * **What** the expense is for. Never derived from, or constrained by,
   * `paymentMethod` — a card-paid subscription belongs in Subscription, not in
   * Bills.
   */
  categoryId: string;
  /**
   * **How** it was paid. The second, fully independent dimension: any category
   * can be paid by any method, and nothing anywhere infers one from the other.
   *
   * Optional and *omitted* when unset — unlike `seriesId` below, which is
   * written as an explicit `null`. Equality queries
   * (`where('paymentMethod', '==', 'credit_card')`) are the intended use and
   * work fine; the trade is that `!=`/`not-in` filters and "everything with no
   * method" match no document that omits the field, which includes every row
   * written before this field existed.
   */
  paymentMethod?: PaymentMethod;
  item: string;
  /** smallest currency unit — no decimals for IDR */
  amount: number;
  /** ISO date, "YYYY-MM-DD" */
  date: string;
  /** denormalized from `date` on write — "YYYY-MM", used for monthly equality queries */
  yearMonth: string;
  /** denormalized from `date` on write — "YYYY", used for yearly equality queries */
  year: string;
  note?: string;
  /**
   * Identifies one run of a repeating charge, shared by every month in it.
   * Explicitly `null` on one-off entries rather than omitted, so both
   * `where('seriesId', '==', null)` and `where('seriesId', '!=', null)` are
   * queryable — a document missing the field would match neither. Stamped by
   * `createTransactionSeries`; never edited afterwards.
   */
  seriesId: string | null;
  /** server timestamp */
  createdAt: Timestamp;
}

/**
 * One source of monthly income — a salary, a side job, a rent cheque.
 *
 * `amount` is per month, and the list hangs off the month's budget document,
 * so a raise or a contract that starts in March is just a different list on
 * March's budget rather than a change that rewrites history.
 */
export interface Income {
  id: string;
  name: string;
  /** per month, smallest currency unit */
  amount: number;
  note?: string;
}

export interface Budget {
  /** "YYYY-MM" — same as the document id */
  id: string;
  /**
   * The single income this month used to hold, before income became a list.
   *
   * Read only as a fallback: `toBudget` synthesises a one-source `incomes`
   * list from it when the document has no `incomes` array, which is what lets
   * an account written before this change keep its income with no migration.
   * Nothing sets it any more — write through `incomes`.
   */
  income: number;
  /** every source funding this month; `totalIncome` is their sum */
  incomes: Income[];
  categoryBudgets: {
    [categoryId: string]: number;
  };
}

/** The share of the monthly limit at which a warning fires. */
export type WarnPct = 70 | 80 | 90;

/**
 * Spending alert settings. One set per account, not per month — they live on
 * the profile document, while what they are *evaluated against* is whichever
 * month is in view.
 */
export interface AlertSettings {
  enabled: boolean;
  /** 0 means unset — nothing is evaluated against it */
  monthlyLimit: number;
  warnPct: WarnPct;
  /**
   * Per-category caps, keyed by the category's display name rather than its
   * id — the alert copy reads the key back out ("Groceries is over its
   * limit"), and the key is what a settings row shows.
   *
   * Keys are canonicalised to the category's own `name` on write and compared
   * with `normalizeCategoryName` on read, so `" groceries"` and `"Groceries"`
   * can never become two separate caps. A key whose category was since
   * renamed or deleted keeps its row — so it can be cleared — but matches no
   * spend, so it never fires.
   */
  categoryLimits: {
    [categoryName: string]: number;
  };
}

export interface Profile {
  displayName: string;
  /** ISO 4217, e.g. "IDR" */
  currency: string;
  /** BCP 47, e.g. "id-ID" */
  locale: string;
  alerts: AlertSettings;
}

/**
 * Write shape for a transaction.
 *
 * `yearMonth`, `year`, `seriesId` and `createdAt` are deliberately absent:
 * they are computed or issued by the write helpers in `lib/queries.ts` so a
 * caller cannot desynchronise them from `date`, or invent a series id.
 */
export type TransactionInput = Omit<
  Transaction,
  'id' | 'yearMonth' | 'year' | 'seriesId' | 'createdAt'
>;

/** Patch shape — `date` changes re-derive `yearMonth` and `year`. */
export type TransactionPatch = Partial<TransactionInput>;

export type CategoryInput = Omit<Category, 'id'>;

/** Identifies a recurring run of transactions written by `createTransactionSeries`. */
export interface TransactionSeriesKey {
  seriesId: string;
  /** inclusive lower bound, "YYYY-MM-DD" — "this month and every one after" */
  fromDate: string;
}
