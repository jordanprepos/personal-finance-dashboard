import type { JSX } from 'react';

/**
 * The phone's manage menu — Accounts, Categories, Settings behind one nav
 * button.
 *
 * These three were separate buttons in the nav's utility group until Accounts
 * made a seventh item. Measured against the real stylesheet at 375px, seven
 * labelled buttons overflow their track by 57px, which is enough to push
 * Settings off the end; tightening the gap to 8px only got it to 38px, and
 * even 6px left 58px hidden once the Home tab is added too. Eight short labels
 * do not fit in a 283px track and no amount of gap tuning changes that.
 *
 * Collapsing them here leaves five items with **zero** overflow — fewer than
 * before, and it also clears the 6px the row was already hiding. They belong
 * together anyway: each opens a surface for maintaining the ledger rather than
 * a view of it, which is exactly the split the `.phone__navsep` was drawing.
 */
export function ManageSheet({
  onAccounts,
  onCategories,
  onSettings,
  onClose,
}: {
  onAccounts: () => void;
  onCategories: () => void;
  onSettings: () => void;
  onClose: () => void;
}): JSX.Element {
  const items: { label: string; hint: string; action: () => void }[] = [
    { label: 'Accounts', hint: 'Balances, limits, reconcile', action: onAccounts },
    { label: 'Categories', hint: 'What expenses are for, and their allocations', action: onCategories },
    { label: 'Settings', hint: 'Tracking cycle and spending alerts', action: onSettings },
  ];

  return (
    <div className="cf-scrim" onClick={onClose} role="presentation">
      <div
        className="cf-sheet cf-anim-in-fast"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Manage"
      >
        <div className="cf-sheet__grab" />

        <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-.02em' }}>Manage</div>
          <span className="cf-spacer" />
          <button type="button" className="cf-back" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className="cf-line phone__entry"
              style={{ minHeight: 56, textAlign: 'left' }}
              onClick={() => {
                onClose();
                item.action();
              }}
            >
              <div className="cf-line__body">
                <div className="cf-line__name">{item.label}</div>
                <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 2 }}>
                  {item.hint}
                </div>
              </div>
              <span style={{ color: 'var(--cf-muted)' }} aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
