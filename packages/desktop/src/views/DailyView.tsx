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

import type { ViewProps } from '../appTypes';

export function DailyView({ state, fmt, onEdit }: ViewProps): JSX.Element {
  const { monthTransactions, categories, budget, yearMonth, today } = state;
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const index = useMemo(() => indexCategories(categories), [categories]);
  const shown = filterTransactions(monthTransactions, categories, { categoryId, query });
  const days = groupByDate(shown);
  const summary = monthSummary(yearMonth, monthTransactions, budget);
  const burn = pace(summary, today);

  // Only categories that actually appear this month get a filter chip.
  const present = categories.filter((c) => monthTransactions.some((t) => t.categoryId === c.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input
          className="cf-input--pos"
          style={{ maxWidth: 280, minHeight: 38 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search item or category…"
        />
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', flex: 1 }}>
          <button
            type="button"
            className={`cf-cat ${categoryId === null ? 'cf-cat--active' : 'cf-cat--idle'}`}
            onClick={() => setCategoryId(null)}
          >
            All
          </button>
          {present.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cf-cat ${categoryId === c.id ? 'cf-cat--active' : 'cf-cat--idle'}`}
              onClick={() => setCategoryId(c.id)}
            >
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
                  <span style={{ color: 'var(--cf-slate)', fontSize: 12.5 }}>
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
              {burn.closed
                ? `Closed month · ${formatMoney(summary.spent, fmt)} spent, ${formatMoney(summary.left, fmt)} left over.`
                : `${formatMoney(burn.delta, fmt)} ${burn.under ? 'under' : 'over'} an even pace for day ${burn.throughDay}.`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
