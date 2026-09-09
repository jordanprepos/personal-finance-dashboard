import { useState, type JSX } from 'react';
import {
  buildDashboardCard,
  buildDashboardCards,
  dashboardCardContext,
  DASHBOARD_CARDS,
  type DashboardCardId,
  type ExpenseState,
  type ExpenseStore,
  type MoneyFormat,
} from '@expense-tracker/shared';

import { DashboardCard, DashboardCardSheet } from '@expense-tracker/design-system';

/**
 * The phone's Home tab: the cards picked on the profile, stacked.
 *
 * The same selection and the same finished cards as the desktop Home view —
 * `buildDashboardCards` does all of it in `shared`, so the two surfaces cannot
 * show different numbers for the same period. Only the layout differs: one
 * column here, and `spec.size` is ignored because there is no second column
 * for a `full` card to span.
 */
export function HomeTab({
  store,
  state,
  fmt,
}: {
  store: ExpenseStore;
  state: ExpenseState;
  fmt: MoneyFormat;
}): JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false);

  const ctx = dashboardCardContext(state, fmt);
  const cards = buildDashboardCards(state.profile.dashboardCards, ctx);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="cf-group__label" style={{ margin: 0 }}>
          {cards.length === 0
            ? 'Your dashboard'
            : `Your dashboard · ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`}
        </div>
        <span className="cf-spacer" />
        <button
          type="button"
          className="cf-ghostbtn"
          style={{ minHeight: 44 }}
          onClick={() => setPickerOpen(true)}
        >
          Customize
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="phone__empty">
          No cards yet. Tap Customize to pick the figures you want on this screen.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cards.map((card, i) => (
            <DashboardCard
              key={card.spec.id}
              card={card}
              canMoveUp={i > 0}
              canMoveDown={i < cards.length - 1}
              onMove={(delta) =>
                void store.moveDashboardCard(card.spec.id as DashboardCardId, delta)
              }
              onRemove={() => void store.removeDashboardCard(card.spec.id as DashboardCardId)}
            />
          ))}
        </div>
      )}

      {pickerOpen ? (
        <DashboardCardSheet
          catalog={DASHBOARD_CARDS.map((spec) => buildDashboardCard(spec.id, ctx))}
          chosen={state.profile.dashboardCards}
          busy={state.busy}
          onAdd={(id) => void store.addDashboardCard(id)}
          onRemove={(id) => void store.removeDashboardCard(id)}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </>
  );
}
