import type { JSX } from 'react';
import {
  categoryTotals,
  donutSegments,
  envelopesByType,
  formatMoney,
  formatPercent,
  monthSummary,
  recurringThisMonth,
  sumAmounts,
  indexCategories,
  categoryOf,
  type Envelope,
} from '@expense-tracker/shared';

import { type ViewProps } from '../appTypes';
import { catStyle } from '../catStyle';

const DONUT_RADIUS = 54;

export function MonthlyView({ store, state, fmt, onAdd }: ViewProps): JSX.Element {
  const { monthTransactions, categories, budget, yearMonth } = state;

  const summary = monthSummary(yearMonth, monthTransactions, budget);
  const totals = categoryTotals(monthTransactions, categories);
  const segments = donutSegments(totals, { radius: DONUT_RADIUS });
  const top = totals.find((t) => t.total > 0) ?? null;

  const fixed = envelopesByType('fixed', categories, monthTransactions, budget);
  const variable = envelopesByType('variable', categories, monthTransactions, budget);
  const savings = envelopesByType('savings', categories, monthTransactions, budget);

  const variableSpent = variable.reduce((sum, e) => sum + e.total, 0);
  const savedThisMonth = savings.reduce((sum, e) => sum + e.total, 0);

  const repeat = recurringThisMonth(monthTransactions);
  const unpriced = monthTransactions.filter((t) => t.amount === 0);
  const index = indexCategories(categories);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="dash__hero">
        <div
          className="cf-darkcard"
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
        >
          <div>
            <div className="cf-darkcard__eyebrow">
              {summary.hasIncome ? 'Budget left' : 'Spent this month'}
            </div>
            <div className="tnum cf-darkcard__title">
              {formatMoney(summary.hasIncome ? summary.left : summary.spent, fmt)}
            </div>
            <div className="cf-darkcard__sub">
              {summary.hasIncome
                ? `of ${formatMoney(summary.income, fmt)} · ${formatPercent(summary.leftShare)} remaining`
                : 'No income set for this month — add one below to see what is left.'}
            </div>
          </div>
          <div style={{ marginTop: 22 }}>
            <svg width="100%" height="8" viewBox="0 0 100 8" preserveAspectRatio="none">
              <rect x="0" y="0" width="100" height="8" rx="4" fill="rgba(255,255,255,.16)" />
              <rect
                x="0"
                y="0"
                width={summary.spentShare * 100}
                height="8"
                rx="4"
                fill="#fff"
              />
            </svg>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11.5,
                color: 'var(--cf-on-dark-soft)',
                marginTop: 8,
              }}
            >
              <span>Spent {formatMoney(summary.spent, fmt)}</span>
              <span>{summary.hasIncome ? formatPercent(summary.spentShare) : '—'}</span>
            </div>
          </div>
        </div>

        <div className="dash__donutcard">
          <div className="dash__donut">
            <svg width="152" height="152" viewBox="0 0 152 152">
              <circle
                cx="76"
                cy="76"
                r={DONUT_RADIUS}
                fill="none"
                stroke="var(--cf-surface-3)"
                strokeWidth="22"
              />
              <g transform="rotate(-90 76 76)" fill="none">
                {segments.map((s) => (
                  <circle
                    key={s.categoryId}
                    cx="76"
                    cy="76"
                    r={DONUT_RADIUS}
                    stroke={s.color}
                    strokeWidth="22"
                    strokeDasharray={s.dash}
                    strokeDashoffset={s.offset}
                  />
                ))}
              </g>
            </svg>
            <div className="dash__donutcenter">
              <div className="tnum" style={{ fontWeight: 700, fontSize: 19, letterSpacing: '-.02em' }}>
                {top ? formatPercent(top.share) : '0%'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--cf-muted)' }}>
                {top ? `is ${top.name.split(' ')[0]}` : 'nothing yet'}
              </div>
            </div>
          </div>

          <div className="dash__legend">
            {segments.map((s) => (
              <div key={s.categoryId} className="dash__legendrow">
                <span className="dash__swatch" style={{ background: s.color }} />
                <span style={{ flex: 1 }}>{s.name}</span>
                <span className="tnum" style={{ fontWeight: 600 }}>
                  {formatMoney(s.amount, fmt)}
                </span>
              </div>
            ))}
            <div
              style={{
                borderTop: '1px solid var(--cf-border)',
                paddingTop: 9,
                fontSize: 12,
                color: 'var(--cf-muted)',
              }}
            >
              Variable spend this month: {formatMoney(variableSpent, fmt)} across {variable.length}{' '}
              envelopes
            </div>
          </div>
        </div>
      </div>

      <div className="dash__split">
        <div className="dash__column">
          <div className="cf-group__label" style={{ margin: 0 }}>
            Fixed envelopes
          </div>
          <div className="dash__envelopes">
            {fixed.map((e) => (
              <EnvelopeTile key={e.categoryId} envelope={e} fmt={fmt} onAdd={onAdd} />
            ))}
          </div>

          {variable.length > 0 ? (
            <>
              <div className="cf-group__label" style={{ margin: '6px 0 0' }}>
                Variable envelopes
              </div>
              <div className="dash__envelopes">
                {variable.map((e) => (
                  <EnvelopeTile key={e.categoryId} envelope={e} fmt={fmt} onAdd={onAdd} soft />
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="dash__column">
          <div className="cf-benefits">
            <div className="cf-benefits__label">
              Recurring · {formatMoney(repeat.total, fmt)} / mo
            </div>
            <div className="cf-benefits__grid">
              {repeat.transactions.map((t) => (
                <div key={t.id} className="cf-benefits__row">
                  <span className="cf-benefits__k">{t.item}</span>
                  <span className="tnum cf-benefits__v">{formatMoney(t.amount, fmt)}</span>
                </div>
              ))}
              <div
                className="cf-benefits__row"
                style={{ borderTop: '1px solid var(--cf-border)', paddingTop: 8 }}
              >
                <span className="cf-benefits__k">Share of income</span>
                <span className="cf-benefits__v cf-benefits__v--blue">
                  {/* No income means no share to take — a dash, not 0% of nothing. */}
                  {summary.hasIncome ? formatPercent(repeat.total / summary.income) : '—'}
                </span>
              </div>
            </div>
          </div>

          {unpriced.length > 0 && unpriced[0] ? (
            <div className="cf-promo">
              <div className="cf-promo__title">{unpriced[0].item} has no amount</div>
              <div className="cf-promo__sub">
                {unpriced.length > 1
                  ? `${unpriced.length} entries this month are logged without a price.`
                  : `Logged in ${categoryOf(index, unpriced[0].categoryId).name} without a price.`}
              </div>
              <button type="button" className="cf-add" style={{ marginTop: 12 }} onClick={onAdd}>
                Set amount
              </button>
            </div>
          ) : null}

          <div
            style={{
              background: 'var(--cf-surface-2)',
              border: '1px solid var(--cf-border)',
              borderRadius: 'var(--cf-r-card)',
              padding: 18,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
              Saved this month {formatMoney(savedThisMonth, fmt)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 6 }}>
              {summary.entryCount} entries · {formatMoney(sumAmounts(monthTransactions), fmt)} logged
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EnvelopeTile({
  envelope,
  fmt,
  onAdd,
  soft = false,
}: {
  envelope: Envelope;
  fmt: ViewProps['fmt'];
  onAdd: () => void;
  soft?: boolean;
}): JSX.Element {
  const allocationLine =
    envelope.allocation === 0
      ? 'no allocation set'
      : envelope.over
        ? `over by ${formatMoney(envelope.overBy, fmt)}`
        : `of ${formatMoney(envelope.allocation, fmt)} allocated`;

  return (
    <div
      className={`cf-tile cf-tile--cat${soft ? ' cf-tile--soft' : ''}`}
      style={catStyle(envelope.color)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="cf-catdot" />
        <span style={{ fontWeight: 600, fontSize: 15 }}>{envelope.name}</span>
        <span className="cf-spacer" />
        <span
          className="cf-tier"
          style={
            envelope.total === 0
              ? { background: 'var(--cf-surface-3)', color: 'var(--cf-muted)' }
              : undefined
          }
        >
          {envelope.count === 0
            ? 'empty'
            : `${envelope.count} ${envelope.count === 1 ? 'item' : 'items'}`}
        </span>
      </div>

      <div>
        <div
          className="tnum"
          style={{
            fontWeight: 700,
            fontSize: 21,
            letterSpacing: '-.02em',
            color: envelope.total === 0 ? 'var(--cf-muted)' : 'var(--cf-ink)',
          }}
        >
          {formatMoney(envelope.total, fmt)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 2 }}>{allocationLine}</div>
      </div>

      <svg width="100%" height="6" viewBox="0 0 100 6" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="6" rx="3" fill="var(--cf-surface-3)" />
        <rect x="0" y="0" width={envelope.fill * 100} height="6" rx="3" fill={envelope.color} />
      </svg>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          fontSize: 12.5,
          color: 'var(--cf-slate)',
        }}
      >
        {envelope.items.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              color: item.unpriced ? 'var(--cf-muted)' : 'var(--cf-slate)',
            }}
          >
            <span
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {item.item}
            </span>
            <span className="tnum">{item.unpriced ? '—' : formatMoney(item.amount, fmt)}</span>
          </div>
        ))}
        {envelope.empty ? (
          <button
            type="button"
            className="cf-back"
            style={{ color: 'var(--cf-blue)', fontWeight: 600 }}
            onClick={onAdd}
          >
            + log something here
          </button>
        ) : null}
      </div>
    </div>
  );
}
