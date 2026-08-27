import {
  type ExpenseState,
  type ExpenseStore,
  type MoneyFormat,
  type Transaction,
} from '@expense-tracker/shared';

export type Tab = 'daily' | 'monthly' | 'yearly';

export interface ViewProps {
  store: ExpenseStore;
  state: ExpenseState;
  fmt: MoneyFormat;
  onEdit: (transaction: Transaction) => void;
  onAdd: () => void;
}
