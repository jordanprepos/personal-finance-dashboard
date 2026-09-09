import {
  type ExpenseState,
  type ExpenseStore,
  type MoneyFormat,
  type Transaction,
} from '@expense-tracker/shared';

export type Tab = 'home' | 'daily' | 'monthly' | 'yearly' | 'income';

/**
 * The tabs the segmented control offers. `income` is deliberately absent: it
 * is a page of its own, reached from the toolbar's Income button, not a fourth
 * view of the month's spending.
 *
 * `home` leads, since it is the view you assembled yourself; the three behind
 * it are unchanged and remain the full, non-negotiable picture of the period.
 */
export const SPEND_TABS: readonly Tab[] = ['home', 'daily', 'monthly', 'yearly'];

export interface ViewProps {
  store: ExpenseStore;
  state: ExpenseState;
  fmt: MoneyFormat;
  onEdit: (transaction: Transaction) => void;
  onAdd: () => void;
}
