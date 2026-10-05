import type { JSX } from 'react';
import { clampCycleStartDay, MAX_CYCLE_START_DAY } from '@expense-tracker/shared';

import { useCommittedInput } from '../useCommittedInput.js';

/**
 * The cycle start day, as the settings surfaces take it. A plain day number
 * rather than a date picker: a period opens on the same day every month, and
 * `MAX_CYCLE_START_DAY` is what keeps it a day every month actually has.
 *
 * One component for both surfaces — `AlertSettingsModal` and `AlertSheet`
 * each had an identical copy.
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
