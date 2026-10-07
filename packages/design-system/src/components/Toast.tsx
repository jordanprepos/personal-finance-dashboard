import type { JSX } from 'react';

export interface ToastProps {
  /** `state.toast` */
  text: string;
  /** `state.undoable` — the toast reports a delete that can still be reversed */
  undoable: boolean;
  /** `store.undo()` */
  onUndo: () => void;
}

/**
 * The store's toast, with Undo when it reports a delete.
 *
 * One component for both apps, so neither surface can render the message and
 * forget the button. Deletes — an entry, a run's remaining months, a category
 * with its entries — take effect on a single tap and say so here, with the
 * way back beside the words, rather than asking for a confirm first: a confirm
 * costs a tap on every intended delete and still loses data on a mis-tap.
 * Undo stays as long as this toast does; any later toast replaces it.
 */
export function Toast({ text, undoable, onUndo }: ToastProps): JSX.Element {
  return (
    <div className="cf-toast cf-anim-in-fast" role="status">
      <span>{text}</span>
      {undoable ? (
        <button type="button" className="cf-toast__undo" onClick={onUndo}>
          Undo
        </button>
      ) : null}
    </div>
  );
}
