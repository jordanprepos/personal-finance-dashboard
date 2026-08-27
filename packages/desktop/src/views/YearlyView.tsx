import type { JSX } from 'react';
import {
  bucketByMonth,
  categoryTotals,
  formatMoney,
  formatMoneyShort,
  formatPercent,
  formatShare,
  splitByType,
  yearBars,
  yearSummary,
} from '@expense-tracker/shared';

import { type ViewProps } from '../appTypes';
import { catStyle } from '../catStyle';

const CHART_WIDTH = 1120;
const CHART_HEIGHT = 240;

interface Props extends ViewProps {
  year: string;
}

export function YearlyView({ state, store, fmt, year }: Props): JSX.Element {
  const { yearTransactions, categories, budget, yearMonth } = state;

  const buckets = bucketByMonth(year, yearTransactions);
  const summary = yearSummary(year, buckets);
  const income = budget?.income ?? 0;
  const { bars, ceilingY } = yearBars(buckets, {
    chartWidth: CHART_WIDTH,
    chartHeight: CHART_HEIGHT,
    barWidth: 80,
    ceiling: income,
    currentYearMonth: yearMonth,
  });

  const totals = categoryTotals(yearTransactions, categories);
  const split = splitByType(yearTransactions, categories);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="dash__stats">
        <div>
          <div className="cf-group__label">Spent in {year}</div>
          <div className="tnum" style={{ fontWeight: 700, fontSize: 30, letterSpacing: '-.025em' }}>
            {formatMoney(summary.total, fmt)}
          </div>
        </div>
        <div>
          <div className="cf-group__label">Monthly average</div>
          <div className="tnum" style={{ fontWeight: 600, fontSize: 18 }}>
            {formatMoney(summary.average, fmt)}
          </div>
        </div>
        <div>
          <div className="cf-group__label">Biggest month</div>
          <div className="tnum" style={{ fontWeight: 600, fontSize: 18 }}>
            {formatMoney(summary.peak, fmt)}
          </div>
        </div>
        <span className="cf-spacer" />
        <div style={{ fontSize: 11.5, color: 'var(--cf-muted)' }}>Click a bar to open that month</div>
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11.5,
            color: 'var(--cf-muted)',
            marginBottom: 8,
          }}
        >
          <span style={{ width: 18, height: 0, borderTop: '1.5px dashed var(--cf-blue)' }} />
          <span>Income line · {formatMoney(income, fmt)}</span>
        </div>

        <svg
          width="100%"
          height={CHART_HEIGHT}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
        >
          <g stroke="var(--cf-surface-3)" strokeWidth="1">
            {[10, 70, 130, 190, 230].map((y) => (
              <line key={y} x1="0" y1={y} x2={CHART_WIDTH} y2={y} />
            ))}
          </g>
          {income > 0 ? (
            <line
              x1="0"
              y1={ceilingY}
              x2={CHART_WIDTH}
              y2={ceilingY}
              stroke="var(--cf-blue)"
              strokeWidth="1.5"
              strokeDasharray="6 5"
            />
          ) : null}
          {bars.map((bar) => (
            <rect
              key={bar.yearMonth}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx="4"
              fill={
                bar.current
                  ? 'var(--cf-blue)'
                  : bar.empty
                    ? 'var(--cf-surface-3)'
                    : 'var(--cf-border-strong)'
              }
            />
          ))}
        </svg>

        <div className="dash__monthcells">
          {bars.map((bar) => (
            <button
              key={bar.yearMonth}
              type="button"
              className="dash__monthcell"
              style={{ background: bar.current ? 'var(--cf-blue-pale)' : 'transparent' }}
              onClick={() => void store.setYearMonth(bar.yearMonth)}
            >
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 11.5,
                  color: bar.current
                    ? 'var(--cf-blue)'
                    : bar.empty
                      ? 'var(--cf-muted)'
                      : 'var(--cf-ink)',
                }}
              >
                {bar.label}
              </span>
              <span
                className="tnum"
                style={{
                  fontSize: 10.5,
                  color: bar.current ? 'var(--cf-blue)' : 'var(--cf-muted)',
                }}
              >
                {bar.empty ? '—' : formatMoneyShort(bar.total, fmt)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="dash__split">
        <div>
          <div className="dash__yearhead">
            <span>Category · year to date</span>
            <span style={{ textAlign: 'right' }}>Entries</span>
            <span style={{ textAlign: 'right' }}>Total</span>
            <span style={{ textAlign: 'right' }}>Share</span>
          </div>
          {totals.map((row) => {
            const color = row.total === 0 ? 'var(--cf-muted)' : 'var(--cf-ink)';
            return (
              <div key={row.categoryId} className="dash__yearrow">
                <span
                  className="cf-catname"
                  style={{ ...catStyle(row.color), fontWeight: 500, color }}
                >
                  <span className="cf-catdot" />
                  {row.name}
                </span>
                <span className="tnum" style={{ textAlign: 'right', color: 'var(--cf-muted)' }}>
                  {row.count}
                </span>
                <span className="tnum" style={{ textAlign: 'right', fontWeight: 600, color }}>
                  {formatMoney(row.total, fmt)}
                </span>
                <span className="tnum" style={{ textAlign: 'right', color: 'var(--cf-slate)' }}>
                  {summary.total > 0 ? formatShare(row.share, fmt.locale) : '—'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="cf-benefits">
          <div className="cf-benefits__label">Fixed vs variable · year</div>
          <div className="cf-benefits__grid">
            <div className="cf-benefits__row">
              <span className="cf-benefits__k">Fixed</span>
              <span className="tnum cf-benefits__v">{formatMoney(split.fixed, fmt)}</span>
            </div>
            <div className="cf-benefits__row">
              <span className="cf-benefits__k">Variable</span>
              <span className="tnum cf-benefits__v">{formatMoney(split.variable, fmt)}</span>
            </div>
            <div className="cf-benefits__row">
              <span className="cf-benefits__k">Savings</span>
              <span className="tnum cf-benefits__v">{formatMoney(split.savings, fmt)}</span>
            </div>
            <div
              className="cf-benefits__row"
              style={{ borderTop: '1px solid var(--cf-border)', paddingTop: 8 }}
            >
              <span className="cf-benefits__k">Fixed share</span>
              <span className="cf-benefits__v cf-benefits__v--blue">
                {split.total > 0 ? formatPercent(split.fixedShare) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
