import { useEffect, useState, type KeyboardEvent } from 'react';

/**
 * A text input that holds what is being typed and commits on blur or Enter —
 * the settings surfaces' cycle-day and money fields, on desktop and phone.
 *
 * The four fields carried this state, effect and commit logic as two pairs of
 * near-verbatim twins; only their markup differs, so that is all each field
 * keeps.
 *
 * - The text follows `value` when it changes from elsewhere — a write landing
 *   from another tab, or the clamp below.
 * - On commit the text snaps to what `parse` made of it, so a typed 31 does not
 *   sit there looking accepted after being clamped to 28.
 * - `onCommit` runs only when the parsed value differs from the stored one.
 */
export function useCommittedInput({
  value,
  format,
  parse,
  onCommit,
}: {
  value: number;
  /** stored value → field text */
  format: (value: number) => string;
  /** field text → the value to store, already clamped */
  parse: (text: string) => number;
  onCommit: (next: number) => void;
}): {
  text: string;
  setText: (text: string) => void;
  /** wire to the input's onBlur */
  commit: () => void;
  /** wire to the input's onKeyDown: Enter blurs, which commits */
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
} {
  const [text, setText] = useState(() => format(value));
  // Keyed on `value` alone: `format` is a pure mapping of it, and following
  // it too would reset the field on every render of a caller that passes an
  // inline function.
  useEffect(() => setText(format(value)), [value]);

  const commit = (): void => {
    const next = parse(text);
    setText(format(next));
    if (next !== value) onCommit(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  return { text, setText, commit, onKeyDown };
}

/**
 * A money field's text for a stored amount: empty for 0, which is how an
 * unset limit reads — and what committing an empty field stores.
 */
export const amountFieldText = (value: number): string => (value > 0 ? String(value) : '');
