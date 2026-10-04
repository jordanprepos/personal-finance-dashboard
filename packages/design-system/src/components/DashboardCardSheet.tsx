import type { JSX } from 'react';

import { DashboardCatalog } from './DashboardCatalog.js';
import type { DashboardPickerProps } from '../types.js';
import { useDismiss } from '../useDismiss.js';

export type DashboardCardSheetProps = DashboardPickerProps;

/**
 * The dashboard card picker as a bottom sheet — the phone's equivalent of
 * `DashboardCardPicker`, taking exactly the same props and driving the same
 * store methods.
 *
 * Must be rendered inside `.cf-phone`: `.cf-scrim` is positioned absolutely,
 * so without that shell it collapses to nothing.
 */
export function DashboardCardSheet({
  catalog,
  chosen,
  busy,
  onAdd,
  onRemove,
  onClose,
}: DashboardCardSheetProps): JSX.Element {
  const { dismiss } = useDismiss({ onClose });
  return (
    <div className="cf-scrim" onClick={dismiss} role="presentation">
      <div
        className="cf-sheet cf-anim-in-fast"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Dashboard cards"
      >
        <div className="cf-sheet__grab" />

        <div style={{ display: 'flex', alignItems: 'center', flex: 'none', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-.02em' }}>
              Dashboard cards
            </div>
            <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 2 }}>
              {chosen.length === 0
                ? 'Nothing on your dashboard yet.'
                : `${chosen.length} on your dashboard.`}
            </div>
          </div>
          <span className="cf-spacer" />
          <button type="button" className="cf-back" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          <DashboardCatalog
            catalog={catalog}
            chosen={chosen}
            busy={busy}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        </div>
      </div>
    </div>
  );
}
