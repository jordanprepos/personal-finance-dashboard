import type { CSSProperties, JSX } from 'react';

export interface CarryOverButtonProps {
  /** Disables the button while a write is in flight. */
  busy: boolean;
  /** `store.carryOverBudget` — fills the period's gaps from earlier months. */
  onCarryOver: () => void;
  /** Merged over the ghost styling, for call sites with layout needs. */
  style?: CSSProperties;
}

/**
 * "Copy from last month" — offered wherever an empty plan shows: the Income
 * page's no-sources state, the "No income set" hint, the Categories manager,
 * on both surfaces.
 *
 * One component rather than seven copies, as `DefaultCategoriesButton` is:
 * the label and the `busy` rule were repeated at every call site and would
 * have drifted. Every one runs the same carry, so each copies income and
 * allocations alike; the toast names which months they came from.
 */
export function CarryOverButton({ busy, onCarryOver, style }: CarryOverButtonProps): JSX.Element {
  return (
    <button type="button" className="cf-ghostbtn" style={style} disabled={busy} onClick={onCarryOver}>
      Copy from last month
    </button>
  );
}
