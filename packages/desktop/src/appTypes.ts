import type { CSSProperties } from 'react';
import {
  categoryVars,
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

/** A category's colour, as the custom properties `tokens.css` styles against. */
export const catStyle = (color: string): CSSProperties => categoryVars(color) as CSSProperties;
