/**
 * Sample data for stories and previews only.
 *
 * Deliberately not exported from `index.ts`: the converter compiles each story
 * module's whole closure, so fixtures reach the preview without entering the
 * shipped bundle. Values mirror the seed dataset's shape — IDR amounts in the
 * smallest unit, category colours from the template palette.
 */
import {
  accountBalances,
  yearWindowStart,
  type Account,
  type AccountBalance,
  type AlertSettings,
  type Category,
  type CategoryLimitRow,
  type Income,
  type Transaction,
} from '@expense-tracker/shared';

/**
 * `Transaction.createdAt` is a Firestore `Timestamp`. None of the expense
 * surfaces read it, so a story stands one up structurally rather than
 * importing the Firestore SDK — which would pull the whole client into every
 * preview bundle to satisfy a field nothing renders. The type is read off
 * `Transaction` so this package needs no Firestore dependency of its own.
 */
type CreatedAt = Transaction['createdAt'];

const stubTimestamp = (iso: string): CreatedAt =>
  ({ toDate: () => new Date(iso), toMillis: () => Date.parse(iso) }) as CreatedAt;

export const categories: Category[] = [
  { id: 'c1', name: 'Groceries', type: 'variable', color: '#1157d9', icon: 'cart', order: 0, archived: false },
  { id: 'c2', name: 'Bills', type: 'fixed', color: '#e8590c', icon: 'bolt', order: 1, archived: false },
  { id: 'c3', name: 'Subscription', type: 'fixed', color: '#7048e8', icon: 'repeat', order: 2, archived: false },
  { id: 'c4', name: 'Transport', type: 'variable', color: '#0ca678', icon: 'car', order: 3, archived: false },
  { id: 'c5', name: 'Emergency Fund', type: 'savings', color: '#f08c00', icon: 'shield', order: 4, archived: false },
];

/** A one-off entry being edited. */
export const transaction: Transaction = {
  id: 't1',
  categoryId: 'c1',
  paymentMethod: 'credit_card',
  item: 'Token Listrik',
  amount: 450_000,
  date: '2026-08-14',
  yearMonth: '2026-08',
  year: '2026',
  seriesId: null,
  createdAt: stubTimestamp('2026-08-14T09:12:00.000Z'),
};

/** A member of a repeating run — offers the "this + future months" delete. */
export const recurringTransaction: Transaction = {
  ...transaction,
  id: 't2',
  categoryId: 'c3',
  item: 'Claude Pro',
  amount: 320_000,
  seriesId: 's-claude-pro',
};

export const yearMonth = '2026-08';
export const today = '2026-08-14';
/** Calendar months — the default, and what the stories render against. */
export const cycleStartDay = 1;
/** Empty, matching `cycleStartDay` above: a calendar month needs no range. */
export const cycleRangeLabel = '';

/** Every callback a form needs, as inert no-ops. */
export const noopHandlers = {
  onSave: () => {},
  onManageAccounts: () => {},
  onDelete: () => {},
  onDeleteSeries: () => {},
  onClose: () => {},
  onManageCategories: () => {},
  onAddDefaultCategories: () => {},
};

/** Entries per category id, as `entryCountsByCategory` returns them. */
export const entryCounts: Record<string, number> = { c1: 24, c2: 6, c3: 3, c4: 11, c5: 1 };

/** This month's allocation per category id. c4 is deliberately unset. */
export const allocations: Record<string, number> = {
  c1: 1_500_000,
  c2: 2_200_000,
  c3: 400_000,
  c5: 1_000_000,
};

export const incomeSource: Income = {
  id: 'i1',
  name: 'Freelance design',
  amount: 6_500_000,
  cadence: 'monthly',
  kind: 'variable',
  day: 25,
  received: false,
  paused: false,
  note: 'Retainer, paid on invoice',
};

export const alertSettings: AlertSettings = {
  enabled: true,
  monthlyLimit: 8_000_000,
  warnPct: 80,
  categoryLimits: { Groceries: 1_500_000, Bills: 2_500_000, Streaming: 200_000 },
};

/**
 * Cap rows for the month in view, as `categoryLimitRows` returns them — one
 * breaching, one warning, and one orphan whose category was renamed away.
 */
export const limitRows: CategoryLimitRow[] = [
  { name: 'Groceries', limit: 1_500_000, spent: 1_260_000, used: 0.84, orphan: false },
  { name: 'Bills', limit: 2_500_000, spent: 2_740_000, used: 1.096, orphan: false },
  { name: 'Streaming', limit: 200_000, spent: 0, used: 0, orphan: true },
];

export const monthSpend = 8_450_000;

/** Every callback a category manager needs, as inert no-ops. */
export const categoryHandlers = {
  onAddCategory: () => {},
  onDeleteCategory: () => {},
  onSetAllocation: () => {},
  onAddDefaultCategories: () => {},
  onClose: () => {},
};

/** Every callback an alert-settings surface needs, as inert no-ops. */
export const alertHandlers = {
  onToggleEnabled: () => {},
  onSetMonthlyLimit: () => {},
  onSetWarnPct: () => {},
  onSetCycleStartDay: () => {},
  onSetCategoryLimit: () => {},
  onClearCategoryLimit: () => {},
  onClose: () => {},
};


/* -------------------------------------------------------------- accounts */

/**
 * One of each shape the balance logic handles: an asset reconciled recently,
 * one reconciled long enough ago to read stale, a card with a limit, and a
 * loan whose balance is a debt.
 */
export const accounts: Account[] = [
  { id: 'ac1', name: 'BCA Daily', type: 'checking', balance: 8_400_000, balanceAsOf: '2026-08-01', limit: 0, monthlyPayment: 0, archived: false, order: 0 },
  { id: 'ac2', name: 'Mandiri Savings', type: 'savings', balance: 21_000_000, balanceAsOf: '2025-11-01', limit: 0, monthlyPayment: 0, archived: false, order: 1 },
  { id: 'ac3', name: 'Visa Signature', type: 'credit_card', balance: 2_300_000, balanceAsOf: '2026-08-01', limit: 15_000_000, monthlyPayment: 2_300_000, archived: false, order: 2 },
  { id: 'ac4', name: 'Motorcycle loan', type: 'other', balance: 12_500_000, balanceAsOf: '2026-08-01', limit: 0, monthlyPayment: 1_150_000, archived: false, order: 3 },
];

/** Built through the real projection, so a change to it moves the stories too. */
export const balances: AccountBalance[] = accountBalances(
  accounts,
  [
    { ...transaction, id: 'ta1', accountId: 'ac1', amount: 450_000, date: '2026-08-14' },
    { ...transaction, id: 'ta2', accountId: 'ac1', amount: 96_000, date: '2026-08-19' },
    { ...transaction, id: 'ta3', accountId: 'ac3', amount: 320_000, date: '2026-08-11' },
  ],
  today,
  yearWindowStart(yearMonth),
);

export const accountHandlers = {
  onAdd: () => {},
  onUpdate: () => {},
  onReconcile: () => {},
  onDelete: () => {},
  onClose: () => {},
};
