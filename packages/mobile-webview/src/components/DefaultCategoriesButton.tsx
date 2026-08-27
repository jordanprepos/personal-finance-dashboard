import type { CSSProperties, JSX } from 'react';
import { DEFAULT_CATEGORIES, type ExpenseState, type ExpenseStore } from '@expense-tracker/shared';

/**
 * "Use my default categories" — offered anywhere an empty category list is a
 * dead end (the Categories sheet, and the Add-expense sheet).
 *
 * One component rather than three copies of the same button: the label, the
 * accent styling and the `busy` rule were duplicated at each call site and
 * would have drifted. The count comes from `DEFAULT_CATEGORIES` rather than
 * prose, so adding a template category can't leave the copy claiming a wrong
 * number.
 *
 * Deliberately duplicated from the desktop app at the same path and name:
 * the component is React, and `shared` stays React-free.
 */
export function DefaultCategoriesButton({
  store,
  state,
  label = 'Use my default categories',
  style,
}: {
  store: ExpenseStore;
  state: ExpenseState;
  label?: string;
  /** Merged over the accent styling, for call sites with layout needs. */
  style?: CSSProperties;
}): JSX.Element {
  return (
    <button
      type="button"
      className="cf-ghostbtn"
      style={{ borderColor: 'var(--cf-blue)', color: 'var(--cf-blue)', ...style }}
      disabled={state.busy}
      onClick={() => void store.addDefaultCategories()}
    >
      {label}
    </button>
  );
}

/** The template's size, for copy that would otherwise hardcode it. */
export const DEFAULT_CATEGORY_COUNT = DEFAULT_CATEGORIES.length;
