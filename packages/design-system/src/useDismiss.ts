import { useEffect, useRef, useState } from 'react';

/**
 * How every modal and sheet is dismissed without pressing its own button:
 * Escape, or a click on the scrim around it.
 *
 * One hook rather than a key listener per component, for two reasons:
 *
 * - **Only the topmost layer answers Escape.** Mobile opens a sheet from
 *   another (Manage → Categories), and a listener per component would close
 *   both on one key press. Mounted layers form a stack; Escape goes to the
 *   last one in.
 * - **A dismiss gesture never throws typed input away.** A stray click beside
 *   a half-filled expense used to close it and lose everything. With `dirty`
 *   set, Escape and the scrim only raise `nudged` — the form says it has
 *   unsaved changes — and its own Cancel stays the one way to discard them.
 */

type Layer = { current: () => void };

const layers: Layer[] = [];

const onKeyDown = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const top = layers[layers.length - 1];
  if (!top) return;
  event.preventDefault();
  top.current();
};

export interface Dismiss {
  /** Wire to the scrim's onClick. Escape calls it too. */
  dismiss: () => void;
  /** A dismiss was refused because of unsaved changes — say so. */
  nudged: boolean;
}

export function useDismiss({
  onClose,
  dirty = false,
}: {
  onClose: () => void;
  /** the form holds input that closing would lose */
  dirty?: boolean;
}): Dismiss {
  const [nudged, setNudged] = useState(false);

  const dismiss = (): void => {
    if (dirty) setNudged(true);
    else onClose();
  };

  // The stack holds a ref, so Escape always reaches this render's `dirty`
  // and `onClose` without re-registering the layer (which would also move it
  // to the top of the stack on every keystroke).
  const layer = useRef<() => void>(dismiss);
  layer.current = dismiss;

  useEffect(() => {
    const entry = layer;
    layers.push(entry);
    if (layers.length === 1) document.addEventListener('keydown', onKeyDown);
    return () => {
      const at = layers.lastIndexOf(entry);
      if (at !== -1) layers.splice(at, 1);
      if (layers.length === 0) document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Once the changes are gone (typed back out) the warning goes with them —
  // and stays gone, so typing again does not bring it back unprompted.
  useEffect(() => {
    if (!dirty) setNudged(false);
  }, [dirty]);

  return { dismiss, nudged: nudged && dirty };
}
