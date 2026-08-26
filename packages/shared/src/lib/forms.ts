import type { ExpenseDraft } from '../store.js';
import type { Category, CategoryType, Transaction } from '../types.js';
import { clampDay, parseISODate } from './dates.js';
import { parseAmountInput } from './format.js';

/**
 * Form logic for the add/edit expense sheet, kept free of any framework so
 * the desktop modal and the mobile bottom sheet validate identically. The
 * views own the raw text state; this turns it into a draft.
 */

export interface ExpenseFormValues {
  /** digits only, as typed */
  amountText: string;
  categoryId: string;
  item: string;
  /** day of month, as typed */
  dayText: string;
  /** write one document per remaining month of the year */
  repeat: boolean;
  note: string;
}

export const emptyExpenseForm = (day: number): ExpenseFormValues => ({
  amountText: '',
  categoryId: '',
  item: '',
  dayText: String(day),
  repeat: false,
  note: '',
});

export const expenseFormFrom = (transaction: Transaction): ExpenseFormValues => ({
  amountText: transaction.amount > 0 ? String(transaction.amount) : '',
  categoryId: transaction.categoryId,
  item: transaction.item,
  dayText: String(parseISODate(transaction.date).day),
  repeat: false,
  note: transaction.note ?? '',
});

export interface ExpenseFormResult {
  amount: number;
  day: number;
  valid: boolean;
  draft: ExpenseDraft | null;
}

export function evaluateExpenseForm(
  values: ExpenseFormValues,
  yearMonth: string,
): ExpenseFormResult {
  const amount = parseAmountInput(values.amountText);
  const day = clampDay(yearMonth, parseInt(values.dayText || '1', 10) || 1);
  const item = values.item.trim();
  const valid = amount > 0 && item !== '' && values.categoryId !== '';

  return {
    amount,
    day,
    valid,
    draft: valid
      ? {
          categoryId: values.categoryId,
          item,
          amount,
          day,
          repeat: values.repeat,
          ...(values.note.trim() ? { note: values.note.trim() } : {}),
        }
      : null,
  };
}

/* ------------------------------------------------------------- categories */

export interface CategoryFormValues {
  name: string;
  allocationText: string;
  type: CategoryType;
}

export const emptyCategoryForm = (): CategoryFormValues => ({
  name: '',
  allocationText: '',
  type: 'variable',
});

export interface CategoryFormResult {
  name: string;
  allocation: number;
  duplicate: boolean;
  valid: boolean;
}

export function evaluateCategoryForm(
  values: CategoryFormValues,
  categories: readonly Category[],
): CategoryFormResult {
  const name = values.name.trim();
  const duplicate = name !== '' && categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
  return {
    name,
    allocation: parseAmountInput(values.allocationText),
    duplicate,
    valid: name !== '' && !duplicate,
  };
}

export const CATEGORY_TYPES: { value: CategoryType; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'variable', label: 'Variable' },
  { value: 'savings', label: 'Savings' },
];
