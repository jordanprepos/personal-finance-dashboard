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
 * How often a source pays. `monthlyAmount` in `lib/derive.ts` is the only
 * place that turns this into a per-month figure — a quarterly source counts
 * for a third of its payment each month, a one-off for its full amount in the
 * month it lands.
 */
export type IncomeCadence = 'monthly' | 'quarterly' | 'one_off';

/** Menu order for the cadence selector — both apps read this list. */
export const INCOME_CADENCES: readonly IncomeCadence[] = ['monthly', 'quarterly', 'one_off'];

export const INCOME_CADENCE_LABELS: Record<IncomeCadence, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  one_off: 'One-off',
};

/** Narrows a stored value to the union; anything else reads as `'monthly'`. */
export const isIncomeCadence = (value: unknown): value is IncomeCadence =>
  typeof value === 'string' && (INCOME_CADENCES as readonly string[]).includes(value);

/**
 * How dependable a source is. Purely a reporting axis — the stability split on
 * the Income panel — with no effect on what a source contributes to the month.
 */
export type IncomeKind = 'fixed' | 'variable';

export const INCOME_KINDS: readonly IncomeKind[] = ['fixed', 'variable'];

export const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  fixed: 'Fixed',
  variable: 'Variable',
};

/** Narrows a stored value to the union; anything else reads as `'fixed'`. */
export const isIncomeKind = (value: unknown): value is IncomeKind =>
  typeof value === 'string' && (INCOME_KINDS as readonly string[]).includes(value);

/**
 * The highest pay day a source can hold. Every month has 28 days, so a source
 * clamped here lands in the period it was promised for regardless of which
 * period it is read against — true of a calendar month and of a salary cycle
 * alike, since a cycle also opens on a day every month has (see
 * `MAX_CYCLE_START_DAY`).
 */
export const MAX_INCOME_DAY = 28;

/**
 * One source of income — a salary, a side job, a rent cheque.
 *
 * `amount` is **per payment**, not per month: a quarterly dividend stores the
 * whole cheque, and `derive.monthlyAmount` is what spreads it across the three
 * months. The list hangs off the month's budget document, so a raise or a
 * contract that starts in March is just a different list on March's budget
 * rather than a change that rewrites history.
 *
 * Every field below `note` is required and always written. A source read from
 * a document that predates them takes the defaults in `queries.toIncome`,
 * which are chosen so a legacy month's total is unchanged: monthly, fixed, not
 * paused.
 */
export interface Income {
  id: string;
  name: string;
  /** per payment, smallest currency unit */
  amount: number;
  cadence: IncomeCadence;
  kind: IncomeKind;
  /** day of the month the payment lands, 1-`MAX_INCOME_DAY` */
  day: number;
  /** whether this month's payment has already landed */
  received: boolean;
  /**
   * A paused source keeps its row and its settings but funds nothing: it is
   * excluded from `totalIncome`, and so from Budget Left, the envelope bars
   * and every other consumer of the month's income.
   */
  paused: boolean;
  note?: string;
}

/** Write shape for a source — the id is minted by the store. */
export type IncomeInput = Omit<Income, 'id'>;

/** Patch shape; absent fields are left as they are. */
export type IncomePatch = Partial<IncomeInput>;

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
  /**
   * The day of the month a tracking cycle opens on — 1-`MAX_CYCLE_START_DAY`.
   *
   * `1` means plain calendar months, and is the default a document written
   * before this field existed reads back as, so nothing about an older account
   * changes. Anything above it makes the period a salary-to-salary window:
   * `27` tracks 27 Aug - 26 Sep as one cycle, labelled by the month it ends in.
   * See `lib/dates.ts` for the arithmetic.
   */
  cycleStartDay: number;
  /**
   * Which dashboard cards this account shows, and in what order — ids from
   * `DASHBOARD_CARDS` in `lib/dashboardCards.ts`.
   *
   * Absent and empty mean different things, which is the whole reason this is
   * an array rather than a map. A document with **no** field falls back to
   * `DEFAULT_DASHBOARD_CARDS`, so an account written before cards existed gets
   * a populated dashboard with no migration; a stored **empty** array is
   * someone who removed every card, and is left exactly as it is. `toProfile`
   * is where that distinction is made.
   */
  dashboardCards: string[];
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
