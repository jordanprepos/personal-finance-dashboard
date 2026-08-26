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

export interface Transaction {
  id: string;
  categoryId: string;
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

export interface Budget {
  /** "YYYY-MM" — same as the document id */
  id: string;
  income: number;
  categoryBudgets: {
    [categoryId: string]: number;
  };
}

export interface Profile {
  displayName: string;
  /** ISO 4217, e.g. "IDR" */
  currency: string;
  /** BCP 47, e.g. "id-ID" */
  locale: string;
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
