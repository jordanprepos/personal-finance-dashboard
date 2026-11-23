import type { JSX } from 'react';
import { clampCycleStartDay, MAX_CYCLE_START_DAY } from '@expense-tracker/shared';

import { useCommittedInput } from '../useCommittedInput.js';

/**
 * The cycle start day, as the settings surfaces take it. A plain day number
 * rather than a date picker: a period opens on the same day every month, and
 * `MAX_CYCLE_START_DAY` is what keeps it a day every month actually has.
 *
 * One component for every place it is asked — `AlertSettingsModal`,
 * `AlertSheet` and the getting-started panel — with one sentence explaining
 * it (`cycleStartDayHint`), so the three cannot word it three ways.
 */
export function CycleStartDayField({
  value,
  ariaLabel,
  onCommit,
}: {
  value: number;
  ariaLabel: string;
  onCommit: (next: number) => void;
}): JSX.Element {
  const field = useCommittedInput({
    value,
    format: String,
    parse: (text) => clampCycleStartDay(parseInt(text || '1', 10) || 1),
    onCommit,
  });

  return (
    <input
      className="tnum cf-input--pos"
      style={{ width: 80 }}
      inputMode="numeric"
      aria-label={ariaLabel}
      value={field.text}
      onChange={(e) => field.setText(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
      onBlur={field.commit}
      onKeyDown={field.onKeyDown}
      max={MAX_CYCLE_START_DAY}
    />
  );
}

/**
 * What the start day currently means, in a sentence — calendar months, or the
 * salary-to-salary window it makes. `rangeLabel` is `periodRangeLabel(state)`:
 * empty on calendar months, "27 Aug – 26 Sep" otherwise.
 */
export const cycleStartDayHint = (rangeLabel: string): string =>
  rangeLabel
    ? `Tracking ${rangeLabel} as one period. Set it to 1 for calendar months.`
    : 'Tracking calendar months. Set this to the day you are paid to track salary to salary.';
