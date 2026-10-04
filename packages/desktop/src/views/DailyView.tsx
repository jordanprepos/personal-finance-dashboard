import { useMemo, useState, type JSX } from 'react';
import {
  categoryOf,
  filterTransactions,
  formatMoney,
  groupByDate,
  indexCategories,
  monthLabel,
  monthSummary,
  pace,
  sumAmounts,
} from '@expense-tracker/shared';

import { type ViewProps } from '../appTypes';
import { catStyle } from '@expense-tracker/design-system';

export function DailyView({ state, fmt, onEdit }: ViewProps): JSX.Element {
  const { monthTransactions, categories, budget, yearMonth, today } = state;
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const index = useMemo(() => indexCategories(categories), [categories]);
  const shown = filterTransactions(monthTransactions, categories, { categoryId, query });
  const days = groupByDate(shown);
  const summary = monthSummary(yearMonth, monthTransactions, budget, today);
  const burn = pace(summary, today, state.profile.cycleStartDay);

  // Only categories that actually appear this month get a filter chip.
  const present = categories.filter((c) => monthTransactions.some((t) => t.categoryId === c.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="dash__filters">
        <input
          className="cf-input--pos dash__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search item or category…"
        />
        <div className="dash__chips">
          <button
            type="button"
            className={`cf-catchip${categoryId === null ? ' cf-catchip--on' : ''}`}
            onClick={() => setCategoryId(null)}
          >
            All
          </button>
          {present.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cf-catchip${categoryId === c.id ? ' cf-catchip--on' : ''}`}
              style={catStyle(c.color)}
              onClick={() => setCategoryId(c.id)}
            >
              <span className="cf-catdot" />
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="dash__split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {days.map((day) => (
            <div key={day.date}>
              <div className="dash__daygroup">
                <span style={{ fontWeight: 600 }}>{day.label}</span>
                <span className="tnum">{formatMoney(day.total, fmt)}</span>
              </div>
              {day.transactions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="cf-row dash__ledgerrow"
                  onClick={() => onEdit(t)}
                >
                  <span>{t.item}</span>
                  <span
                    className="cf-catname"
                    style={{
                      ...catStyle(categoryOf(index, t.categoryId).color),
                      color: 'var(--cf-slate)',
                      fontSize: 12.5,
                    }}
                  >
                    <span className="cf-catdot" />
                    {categoryOf(index, t.categoryId).name}
                  </span>
                  <span
                    className="tnum"
                    style={{
                      textAlign: 'right',
                      fontWeight: 600,
                      color: t.amount === 0 ? 'var(--cf-muted)' : 'var(--cf-ink)',
                    }}
                  >
                    {t.amount === 0 ? 'no amount' : formatMoney(t.amount, fmt)}
                  </span>
                </button>
              ))}
            </div>
          ))}

          {shown.length === 0 ? (
            <div className="dash__empty">
              {query
                ? `Nothing matches “${query}” in ${monthLabel(yearMonth)}.`
                : `Nothing logged in ${monthLabel(yearMonth)} yet.`}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="cf-benefits">
            <div className="cf-benefits__label">This month</div>
            <div className="cf-benefits__grid">
              <div className="cf-benefits__row">
                <span className="cf-benefits__k">Entries</span>
                <span className="tnum cf-benefits__v">{monthTransactions.length}</span>
              </div>
              <div className="cf-benefits__row">
                <span className="cf-benefits__k">Showing</span>
                <span className="tnum cf-benefits__v">{shown.length}</span>
              </div>
              <div className="cf-benefits__row">
                <span className="cf-benefits__k">Filtered total</span>
                <span className="tnum cf-benefits__v cf-benefits__v--blue">
                  {formatMoney(sumAmounts(shown), fmt)}
                </span>
              </div>
            </div>
          </div>

          <div className="cf-promo">
            <div className="cf-promo__title">Pace check</div>
            <div className="cf-promo__sub">
              {/* "Closed" rather than "Closed month": under a salary cycle the
                  period is not a month, and the header above already names it. */}
              {/* With no income there is no target to be over or under — the
                  pace would compare spend against zero and call every rupiah
                  "over". Same wording as the Home tab's Spending pace card. */}
              {burn.closed
                ? summary.hasIncome
                  ? `Closed · ${formatMoney(summary.spent, fmt)} spent, ${formatMoney(summary.left, fmt)} left over.`
                  : `Closed · ${formatMoney(summary.spent, fmt)} spent.`
                : summary.hasIncome
                  ? `${formatMoney(burn.delta, fmt)} ${burn.under ? 'under' : 'over'} an even pace for day ${burn.throughDay}.`
                  : 'Set an income for this period to see a pace target.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
