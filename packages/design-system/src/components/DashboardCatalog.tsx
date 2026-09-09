import { useState, type JSX } from 'react';
import {
  DASHBOARD_CARD_GROUPS,
  DASHBOARD_CARD_GROUP_LABELS,
  type DashboardCardGroup,
  type DashboardCardId,
} from '@expense-tracker/shared';

import { DashboardCard } from './DashboardCard.js';
import type { DashboardPickerProps } from '../types.js';

/**
 * The catalog itself — group tabs, then every card in the active group with a
 * live preview and an add/remove button.
 *
 * Internal to this package and shared by the modal and the sheet rather than
 * written twice: unlike the settings pair, whose fields lay out differently on
 * a phone, the catalog is one scrolling list on both surfaces. The two
 * exported components differ only in the shell they put around it, which is
 * what keeps them honest about taking identical props.
 *
 * Previews render the real period, not sample data. The app this borrows its
 * shape from shows randomly generated numbers because its cards sit behind a
 * paywall; there is nothing to withhold here, and a preview of your own
 * spending is what actually tells you whether you want the card.
 */
export function DashboardCatalog({
  catalog,
  chosen,
  busy,
  onAdd,
  onRemove,
}: Omit<DashboardPickerProps, 'onClose'>): JSX.Element {
  const [group, setGroup] = useState<DashboardCardGroup>('cashflow');

  const picked = new Set(chosen);
  const shown = catalog.filter((c) => c.spec.group === group);

  return (
    <>
      <div className="cf-opts" role="tablist" aria-label="Card groups">
        {DASHBOARD_CARD_GROUPS.map((g) => {
          const count = catalog.filter((c) => c.spec.group === g && picked.has(c.spec.id)).length;
          return (
            <button
              key={g}
              type="button"
              role="tab"
              className={`cf-opt ${group === g ? 'cf-opt--on' : 'cf-opt--off'}`}
              aria-selected={group === g}
              onClick={() => setGroup(g)}
            >
              {DASHBOARD_CARD_GROUP_LABELS[g]}
              {/* How many of this group are already on the dashboard — the
                  screenshot's Premium badge slot, doing something useful. */}
              {count > 0 ? <span className="cf-badge" style={{ marginLeft: 6 }}>{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {shown.map((card) => {
          const on = picked.has(card.spec.id);
          const id = card.spec.id as DashboardCardId;
          return (
            <div key={card.spec.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <DashboardCard card={card} showQuestion />
              <button
                type="button"
                className={on ? 'cf-ghostbtn' : 'cf-add'}
                style={{ alignSelf: 'flex-start' }}
                disabled={busy}
                aria-pressed={on}
                onClick={() => (on ? onRemove(id) : onAdd(id))}
              >
                {on ? 'Remove from Dashboard' : 'Add card to Dashboard'}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
