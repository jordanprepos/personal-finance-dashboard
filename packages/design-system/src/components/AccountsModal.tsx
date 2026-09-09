import type { JSX } from 'react';
import { accountTotals, formatMoney } from '@expense-tracker/shared';

import { AccountsPanel } from './AccountsPanel.js';
import type { AccountManagerProps } from '../types.js';

export type AccountsModalProps = AccountManagerProps;

/**
 * The accounts manager, desktop.
 *
 * Every account, what it holds, and when that was last confirmed. The header
 * carries the net figure — assets less what is owed — so the one number worth
 * knowing is visible before any row is read.
 */
export function AccountsModal({
  balances,
  today,
  busy,
  fmt,
  onAdd,
  onUpdate,
  onReconcile,
  onDelete,
  onClose,
}: AccountsModalProps): JSX.Element {
  // The asset/liability split and its sign convention live in `shared`, so the
  // two surfaces cannot arrive at different notions of "net".
  const { net } = accountTotals(balances);

  return (
    <div className="cf-modal-scrim" style={{ zIndex: 56 }} onClick={onClose} role="presentation">
      <div
        className="cf-modal cf-anim-in-fast"
        style={{ width: '100%', maxWidth: 560, maxHeight: '86vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Accounts"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-.02em' }}>Accounts</div>
            <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', marginTop: 2 }}>
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
  );
}
