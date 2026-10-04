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

/**
 * What each tab is called on screen. `daily` keeps its key but reads
 * "Entries": the view is the whole period's ledger, grouped by day, and
 * "Daily" promised one day's worth. Mobile's tab, which was "Today", reads the
 * same now.
 */
export const TAB_LABELS: Record<Tab, string> = {
  home: 'Home',
  daily: 'Entries',
  monthly: 'Monthly',
  yearly: 'Yearly',
  income: 'Income',
};

export interface ViewProps {
  store: ExpenseStore;
  state: ExpenseState;
  fmt: MoneyFormat;
  onEdit: (transaction: Transaction) => void;
  onAdd: () => void;
  /** Switch to the Income page — the "no income set" hints point here. */
  onOpenIncome: () => void;
  /** The getting-started panel is on screen, so its step two already offers
   * "Add income" — the summary card's own button would be a duplicate. */
  setupShowing: boolean;
}
