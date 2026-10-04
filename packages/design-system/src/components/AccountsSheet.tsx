import type { JSX } from 'react';
import { accountTotals, formatMoney } from '@expense-tracker/shared';

import { AccountsPanel } from './AccountsPanel.js';
import type { AccountManagerProps } from '../types.js';
import { useDismiss } from '../useDismiss.js';

export type AccountsSheetProps = AccountManagerProps;

/**
 * The accounts manager as a bottom sheet — the phone's equivalent of
 * `AccountsModal`, taking exactly the same props and driving the same store
 * methods.
 *
 * Must be rendered inside `.cf-phone`: `.cf-scrim` is positioned absolutely,
 * so without that shell it collapses to nothing.
 */
export function AccountsSheet({
  balances,
  today,
  busy,
  fmt,
  onAdd,
  onUpdate,
  onReconcile,
  onDelete,
  onClose,
}: AccountsSheetProps): JSX.Element {
  const { dismiss } = useDismiss({ onClose });
  const { net } = accountTotals(balances);

  return (
    <div className="cf-scrim" onClick={dismiss} role="presentation">
      <div
        className="cf-sheet cf-anim-in-fast"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Accounts"
      >
        <div className="cf-sheet__grab" />

        <div style={{ display: 'flex', alignItems: 'center', flex: 'none', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-.02em' }}>Accounts</div>
            <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 2 }}>
              {balances.length === 0
                ? 'Nothing tracked yet.'
                : `${formatMoney(net, fmt)} net across ${balances.length} ${balances.length === 1 ? 'account' : 'accounts'}`}
            </div>
          </div>
          <span className="cf-spacer" />
          <button type="button" className="cf-back" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <AccountsPanel
            balances={balances}
            today={today}
            busy={busy}
            fmt={fmt}
            onAdd={onAdd}
            onUpdate={onUpdate}
            onReconcile={onReconcile}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
