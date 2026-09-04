import type { CSSProperties, JSX } from 'react';
import { DEFAULT_CATEGORIES } from '@expense-tracker/shared';

export interface DefaultCategoriesButtonProps {
  /** Disables the button while a write is in flight. */
  busy: boolean;
  /** Seed the account with the template category set. */
  onAdd: () => void;
  label?: string;
  /** Merged over the accent styling, for call sites with layout needs. */
  style?: CSSProperties;
}

/**
 * "Use my default categories" — offered anywhere an empty category list is a
 * dead end (the Categories modal/sheet, and the Add-expense modal/sheet).
 *
 * One component rather than four copies of the same button: the label, the
 * accent styling and the `busy` rule were duplicated at each call site and
 * would have drifted. The count comes from `DEFAULT_CATEGORIES` rather than
 * prose, so adding a template category can't leave the copy claiming a wrong
 * number.
 */
export function DefaultCategoriesButton({
  busy,
  onAdd,
  label = 'Use my default categories',
  style,
}: DefaultCategoriesButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className="cf-ghostbtn"
      style={{ borderColor: 'var(--cf-blue)', color: 'var(--cf-blue)', ...style }}
      disabled={busy}
      onClick={onAdd}
    >
      {label}
    </button>
  );
}

/** The template's size, for copy that would otherwise hardcode it. */
export const DEFAULT_CATEGORY_COUNT = DEFAULT_CATEGORIES.length;
