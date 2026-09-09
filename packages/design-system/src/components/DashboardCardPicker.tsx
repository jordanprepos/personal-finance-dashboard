import type { JSX } from 'react';

import { DashboardCatalog } from './DashboardCatalog.js';
import type { DashboardPickerProps } from '../types.js';

export type DashboardCardPickerProps = DashboardPickerProps;

/**
 * The dashboard card picker, desktop.
 *
 * A catalog of every card the app can draw, grouped into tabs, each shown as a
 * live preview of the period in view with one button to put it on the
 * dashboard or take it off. Adding is immediate — there is no Save, because
 * each button *is* the write, and the dashboard behind repaints from the
 * profile subscription as soon as it lands.
 */
export function DashboardCardPicker({
  catalog,
  chosen,
  busy,
  onAdd,
  onRemove,
  onClose,
}: DashboardCardPickerProps): JSX.Element {
  return (
    <div className="cf-modal-scrim" style={{ zIndex: 56 }} onClick={onClose} role="presentation">
      <div
        className="cf-modal cf-anim-in-fast"
        style={{ width: '100%', maxWidth: 620, maxHeight: '86vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Dashboard cards"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-.02em' }}>
              Dashboard cards
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', marginTop: 2 }}>
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

        <DashboardCatalog
          catalog={catalog}
          chosen={chosen}
          busy={busy}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}
