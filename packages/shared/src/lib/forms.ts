import type { ExpenseDraft } from '../store.js';
import type {
  Category,
  CategoryType,
  Income,
  IncomeCadence,
  IncomeInput,
  IncomeKind,
  PaymentMethod,
  Transaction,
} from '../types.js';
import { MAX_INCOME_DAY } from '../types.js';
import { clampDayInCycle, parseISODate } from './dates.js';
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
  /**
   * How it was paid — `''` is unset, and stays valid. A separate dimension
   * from `categoryId`: neither field constrains the other's options.
   */
  paymentMethod: PaymentMethod | '';
  /**
   * Which pot it came out of — `''` is unset, and stays valid. A third
   * dimension again: no field here constrains another's options.
   */
  accountId: string;
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
  paymentMethod: '',
  accountId: '',
  item: '',
  dayText: String(day),
  repeat: false,
  note: '',
});

export const expenseFormFrom = (transaction: Transaction): ExpenseFormValues => ({
  amountText: transaction.amount > 0 ? String(transaction.amount) : '',
  categoryId: transaction.categoryId,
  paymentMethod: transaction.paymentMethod ?? '',
  accountId: transaction.accountId ?? '',
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
  cycleStartDay = 1,
): ExpenseFormResult {
  const amount = parseAmountInput(values.amountText);
  // Clamped into the period, not the calendar month — the same helper the
  // store resolves the draft's date with, so the two cannot disagree about
  // which day a typed number means.
  const day = clampDayInCycle(yearMonth, parseInt(values.dayText || '1', 10) || 1, cycleStartDay);
  const item = values.item.trim();
  // `paymentMethod` and `accountId` are deliberately absent from this
  // predicate: both are optional and must never block a save.
  const valid = amount > 0 && item !== '' && values.categoryId !== '';

  return {
    amount,
    day,
    valid,
    draft: valid
      ? {
          categoryId: values.categoryId,
          // Always carried, `undefined` included — that is how an edit that
          // clears the selector reaches `updateTransaction`'s unset path. A
          // conditional spread would read as "leave it alone" instead.
          paymentMethod: values.paymentMethod || undefined,
          // Same rule, same reason — always carried so clearing the selector
          // reaches `updateTransaction`'s unset path.
          accountId: values.accountId || undefined,
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

/* ----------------------------------------------------------------- income */

export interface IncomeFormValues {
  name: string;
  /** digits only, as typed — the amount of one payment, not of a month */
  amountText: string;
  /** day of month, as typed */
  dayText: string;
  cadence: IncomeCadence;
  kind: IncomeKind;
  received: boolean;
  note: string;
}

export const emptyIncomeForm = (): IncomeFormValues => ({
  name: '',
  amountText: '',
  dayText: '25',
  cadence: 'monthly',
  kind: 'fixed',
  received: false,
  note: '',
});

export const incomeFormFrom = (income: Income): IncomeFormValues => ({
  name: income.name,
  amountText: income.amount > 0 ? String(income.amount) : '',
  dayText: String(income.day),
  cadence: income.cadence,
  kind: income.kind,
  received: income.received,
  note: income.note ?? '',
});

export interface IncomeFormResult {
  amount: number;
  day: number;
  valid: boolean;
  /**
   * `paused` is absent from the form on purpose — pausing is a row action, not
   * a field, so an edit never resumes a source behind the user's back. The
   * store fills it from the source being edited.
   */
  draft: Omit<IncomeInput, 'paused'> | null;
}

/**
 * Validates the add/edit income form. `day` is clamped to
 * `MAX_INCOME_DAY` rather than to the month in view: a source promised on the
 * 28th should stay on the 28th in February too.
 */
export function evaluateIncomeForm(values: IncomeFormValues): IncomeFormResult {
  const amount = parseAmountInput(values.amountText);
  const day = Math.min(MAX_INCOME_DAY, Math.max(1, parseInt(values.dayText || '1', 10) || 1));
  const name = values.name.trim();
  const valid = name !== '' && amount > 0;
  const note = values.note.trim();

  return {
    amount,
    day,
    valid,
    draft: valid
      ? {
          name,
          amount,
          day,
          cadence: values.cadence,
          kind: values.kind,
          received: values.received,
          // Unlike the expense form's `paymentMethod`, an absent note here is
          // "no note" for both create and edit — `updateIncome` drops the key
          // when the trimmed text is empty.
          note,
        }
      : null,
  };
}

/* ------------------------------------------------------------ credentials */

export type CredentialField = 'email' | 'password';

export interface CredentialError {
  /** the input to mark, so the view never has to sniff the message text */
  field: CredentialField;
  message: string;
}

/** The email half of `validateCredentials`, for flows that take no password. */
export function validateEmail(email: string): CredentialError | null {
  return email.includes('@') ? null : { field: 'email', message: 'Enter a valid email address.' };
}

/**
 * Login form validation, matching the design's thresholds and wording. Firebase
 * checks both again server-side; this is the local pass that keeps an obvious
 * typo from costing a round trip.
 */
export function validateCredentials(email: string, password: string): CredentialError | null {
  const invalidEmail = validateEmail(email);
  if (invalidEmail) return invalidEmail;
  if (password.length < 6) {
    return { field: 'password', message: 'Password must be at least 6 characters.' };
  }
  return null;
}
