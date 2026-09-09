import type {
  Account,
  AccountBalance,
  AccountInput,
  AccountType,
  AlertSettings,
  Category,
  CategoryLimitRow,
  CategoryType,
  ExpenseDraft,
  Income,
  IncomeInput,
  MoneyFormat,
  Transaction,
  WarnPct,
} from '@expense-tracker/shared';

/**
 * What an expense form needs to render and report, on either surface.
 *
 * Every field is plain data or a callback — nothing here is a controller, so
 * the form can be rendered from literals with no store, no Firebase and no
 * session. The desktop modal and the mobile sheet take exactly this contract;
 * they differ only in layout.
 */
export interface ExpenseFormProps {
  /** the period in view, "YYYY-MM" — decides the day clamp and the footnote */
  yearMonth: string;
  /** "YYYY-MM-DD"; the default day comes from it when it falls in `yearMonth` */
  today: string;
  /**
   * The day a tracking period opens on; 1 is a plain calendar month. The "Day"
   * field is still a day-of-month number under a salary cycle — each one occurs
   * at most once in the window — but which date it means depends on this.
   */
  cycleStartDay: number;
  categories: readonly Category[];
  /**
   * The accounts an expense can be drawn on. A third axis: never filtered by
   * the picked category or payment method, and never inferred from either.
   * Empty offers a handoff to the accounts surface instead of a dead select.
   */
  accounts: readonly Account[];
  /** a write is in flight — disables Save */
  busy: boolean;
  fmt: MoneyFormat;
  /** null when adding, the entry being edited otherwise */
  transaction: Transaction | null;
  /** whether `transaction` belongs to a series, which offers the second delete */
  isRecurring: boolean;
  /** valid draft, plus the entry it edits (null when adding) */
  onSave: (draft: ExpenseDraft, transaction: Transaction | null) => void;
  onDelete: (transaction: Transaction) => void;
  /** delete this entry and every later month in its series */
  onDeleteSeries: (transaction: Transaction) => void;
  onClose: () => void;
  /** hands off to the categories surface when there is nothing to pick yet */
  onManageCategories: () => void;
  /** seeds the account from the category template */
  onAddDefaultCategories: () => void;
  /** hands off to the accounts surface when there is nothing to draw on yet */
  onManageAccounts: () => void;
}

/**
 * What a category manager needs, on either surface.
 *
 * `entryCounts` and `allocations` are plain maps keyed by category id rather
 * than the raw transaction list and budget document: the surfaces only ever
 * showed a count and an amount per category, and maps keep the contract free
 * of `Transaction` (whose `createdAt` is a Firestore `Timestamp`, not
 * something a design can write as a literal).
 */
export interface CategoryManagerProps {
  categories: readonly Category[];
  /** entries per category id, over the year in view */
  entryCounts: Readonly<Record<string, number>>;
  /** this month's allocation per category id; missing or 0 reads as unset */
  allocations: Readonly<Record<string, number>>;
  /** the month in view, "YYYY-MM" */
  yearMonth: string;
  busy: boolean;
  fmt: MoneyFormat;
  onAddCategory: (name: string, type: CategoryType, allocation: number) => void;
  onDeleteCategory: (category: Category) => void;
  onAddDefaultCategories: () => void;
  onClose: () => void;
}

/**
 * What an income editor needs, on either surface.
 *
 * `paused` is deliberately absent from the draft: pausing is a row action, not
 * a field, so saving an edit never quietly resumes a paused source. The caller
 * fills it from the source being edited.
 */
export interface IncomeEditorProps {
  fmt: MoneyFormat;
  /** the month whose income list is being edited, "YYYY-MM" */
  yearMonth: string;
  /** null adds a new source; a source edits that one */
  editing: Income | null;
  /** valid draft, plus the source it edits (null when adding) */
  onSave: (draft: Omit<IncomeInput, 'paused'>, editing: Income | null) => void;
  onClose: () => void;
}

/**
 * What an alert-settings surface needs, on either surface.
 *
 * The settings themselves live on the profile and are the same every month;
 * what each row *shows* — spend, percent used — belongs to the month in view.
 * That month-dependent part arrives already derived (`rows`, `monthSpend`,
 * via `categoryLimitRows` and `sumAmounts`) rather than as a transaction list,
 * so the contract stays free of `Transaction`.
 */
export interface AlertSettingsProps {
  alerts: AlertSettings;
  /**
   * The day a tracking period opens on, 1-`MAX_CYCLE_START_DAY`. Lives on the
   * profile beside `alerts`, which is why it shares this surface.
   */
  cycleStartDay: number;
  /** "27 Aug – 26 Sep" for the period in view; empty on calendar months */
  cycleRangeLabel: string;
  /** per-category cap rows for the month in view */
  rows: readonly CategoryLimitRow[];
  /** total spend for the month in view, against the monthly cap */
  monthSpend: number;
  categories: readonly Category[];
  fmt: MoneyFormat;
  onToggleEnabled: (enabled: boolean) => void;
  onSetMonthlyLimit: (amount: number) => void;
  onSetWarnPct: (pct: WarnPct) => void;
  /** 1 tracks calendar months; anything higher makes the period a salary cycle */
  onSetCycleStartDay: (day: number) => void;
  /** name is canonicalised to the category's own `name` by the caller */
  onSetCategoryLimit: (name: string, amount: number) => void;
  onClearCategoryLimit: (name: string) => void;
  onClose: () => void;
}

/**
 * What an accounts manager needs, on either surface.
 *
 * `balances` arrive already projected by `lib/accounts.ts` — reconciled figure,
 * what has been spent since, whether the reconciliation is too old to project
 * from — so this surface does no arithmetic and never sees a `Transaction`
 * (whose `createdAt` is a Firestore `Timestamp`, not something a design can
 * write as a literal).
 *
 * Reconcile is deliberately part of this contract rather than folded into
 * `onUpdate`: a balance and the date it was true are meaningless apart, and it
 * is the action that will be taken most, since a projection is only ever as
 * good as the last time it ran.
 */
export interface AccountManagerProps {
  balances: readonly AccountBalance[];
  /** "YYYY-MM-DD" — the default as-of date when reconciling */
  today: string;
  busy: boolean;
  fmt: MoneyFormat;
  onAdd: (input: Omit<AccountInput, 'order' | 'archived' | 'balanceAsOf'>) => void;
  onUpdate: (accountId: string, patch: { name?: string; type?: AccountType; limit?: number; monthlyPayment?: number }) => void;
  onReconcile: (accountId: string, balance: number, asOf: string) => void;
  onDelete: (account: Account) => void;
  onClose: () => void;
}
