import type { JSX } from 'react';
import {
  buildDashboardCards,
  dashboardCardContext,
  type DashboardCardId,
} from '@expense-tracker/shared';
import { DashboardCard } from '@expense-tracker/design-system';

import { type ViewProps } from '../appTypes';

interface Props extends ViewProps {
  onCustomize: () => void;
}

/**
 * The dashboard you compose yourself: the cards picked on the profile, in the
 * order they were picked.
 *
 * Nothing is derived here. `buildDashboardCards` turns the snapshot into
 * finished cards in `shared`, and the grid only decides how wide each one
 * sits — so the same selection renders identically on the phone, where it is
 * one column.
 */
export function HomeView({ store, state, fmt, onCustomize }: Props): JSX.Element {
  const chosen = state.profile.dashboardCards;
  const cards = buildDashboardCards(chosen, dashboardCardContext(state, fmt));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="cf-group__label" style={{ margin: 0 }}>
          {cards.length === 0
            ? 'Your dashboard'
            : `Your dashboard · ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`}
        </div>
        <span className="cf-spacer" />
        <button type="button" className="cf-ghostbtn" onClick={onCustomize}>
          Customize
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="cf-promo">
          <div className="cf-promo__title">No cards on your dashboard</div>
          <div className="cf-promo__sub">
            Pick the figures you actually want to see — budget left, spending pace, where the
            money went — and they will render here for whichever period you are on.
          </div>
          <button type="button" className="cf-add" style={{ marginTop: 12 }} onClick={onCustomize}>
            Choose cards
          </button>
        </div>
      ) : (
        <div className="dash__cards">
          {cards.map((card, i) => (
            <div
              key={card.spec.id}
              className={card.spec.size === 'full' ? 'dash__card--full' : undefined}
            >
              <DashboardCard
                card={card}
                canMoveUp={i > 0}
                canMoveDown={i < cards.length - 1}
                onMove={(delta) =>
                  void store.moveDashboardCard(card.spec.id as DashboardCardId, delta)
                }
                onRemove={() =>
                  void store.removeDashboardCard(card.spec.id as DashboardCardId)
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
