import type { JSX } from 'react';
import {
  CARD_CHART_HEIGHT,
  CARD_CHART_WIDTH,
  CARD_DONUT_RADIUS,
  type DashboardCardBody,
  type DashboardCardRow,
} from '@expense-tracker/shared';

import type { DashboardCardProps } from '../types.js';

export type { DashboardCardProps };

/**
 * One dashboard card.
 *
 * Surface-neutral, like `DefaultCategoriesButton` — it uses only the shared
 * `.cf-*` vocabulary and scales its charts through a `viewBox`, so the same
 * component sits in the desktop grid and in the phone's single column without
 * a second implementation to keep in step.
 *
 * Every figure arrives formatted and every arc pre-measured from
 * `buildDashboardCard`, so there is no arithmetic here at all. Four body
 * shapes cover the whole catalog; adding a card to the registry needs a new
 * body type only if it cannot be said as a stat, a list, a donut or a bar
 * chart.
 */
export function DashboardCard({
  card,
  showQuestion = false,
  onRemove,
  onMove,
  canMoveUp = false,
  canMoveDown = false,
}: DashboardCardProps): JSX.Element {
  const { spec, periodLabel, body } = card;

  return (
    <section
      className="cf-tile"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      aria-label={spec.title}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-.01em' }}>{spec.title}</div>
          {showQuestion ? (
            <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', marginTop: 2 }}>
              {spec.question}
            </div>
          ) : null}
        </div>
        {/* Reorder sits on the card itself: the list it reorders is the one
            you are looking at, not the catalog. Hidden at either end rather
            than disabled — there is nowhere for it to go. */}
        {onMove && canMoveUp ? (
          <button type="button" className="cf-back cf-cardctl" aria-label={`Move ${spec.title} up`} onClick={() => onMove(-1)}>
            ↑
          </button>
        ) : null}
        {onMove && canMoveDown ? (
          <button type="button" className="cf-back cf-cardctl" aria-label={`Move ${spec.title} down`} onClick={() => onMove(1)}>
            ↓
          </button>
        ) : null}
        {onRemove ? (
          <button type="button" className="cf-dangerlink cf-cardctl" aria-label={`Remove ${spec.title}`} onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </header>

      {/* The window the numbers came from. A card is only ever as current as
          the period in view, and under a salary cycle the month name alone
          would not say where that period starts. */}
      <div className="cf-group__label" style={{ margin: 0 }}>
        {periodLabel}
      </div>

      <Body body={body} />
    </section>
  );
}

function Body({ body }: { body: DashboardCardBody }): JSX.Element {
  switch (body.type) {
    case 'stat':
      return (
        <div>
          <div
            className="tnum"
            style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-.025em' }}
          >
            {body.value}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', marginTop: 3 }}>
            {body.caption}
          </div>
          {body.progress === undefined ? null : (
            <svg
              width="100%"
              height="6"
              viewBox="0 0 100 6"
              preserveAspectRatio="none"
              style={{ marginTop: 12, display: 'block' }}
              aria-hidden="true"
            >
              <rect x="0" y="0" width="100" height="6" rx="3" fill="var(--cf-surface-3)" />
              <rect
                x="0"
                y="0"
                width={body.progress * 100}
                height="6"
                rx="3"
                fill="var(--cf-blue)"
              />
            </svg>
          )}
        </div>
      );

    case 'rows':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {body.rows.length === 0 ? (
            <Empty text={body.empty} />
          ) : (
            body.rows.map((row) => <Row key={row.key} row={row} />)
          )}
          {body.footer ? (
            <div
              className="cf-benefits__row"
              style={{ borderTop: '1px solid var(--cf-border)', paddingTop: 9 }}
            >
              <span className="cf-benefits__k">{body.footer.label}</span>
              <span className="tnum cf-benefits__v">{body.footer.value}</span>
            </div>
          ) : null}
        </div>
      );

    case 'donut': {
      // Segments were measured against `CARD_DONUT_RADIUS`; the box just has
      // to leave room for half a stroke on each side.
      const stroke = 18;
      const box = (CARD_DONUT_RADIUS + stroke / 2) * 2 + 8;
      const c = box / 2;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: box, height: box, flex: 'none' }}>
            <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
              <circle
                cx={c}
                cy={c}
                r={CARD_DONUT_RADIUS}
                fill="none"
                stroke="var(--cf-surface-3)"
                strokeWidth={stroke}
              />
              <g transform={`rotate(-90 ${c} ${c})`} fill="none">
                {body.segments.map((s) => (
                  <circle
                    key={s.categoryId}
                    cx={c}
                    cy={c}
                    r={CARD_DONUT_RADIUS}
                    stroke={s.color}
                    strokeWidth={stroke}
                    strokeDasharray={s.dash}
                    strokeDashoffset={s.offset}
                  />
                ))}
              </g>
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
              }}
            >
              <div
                className="tnum"
                style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-.02em' }}
              >
                {body.centerValue}
              </div>
              <div style={{ fontSize: 11, color: 'var(--cf-muted)' }}>{body.centerCaption}</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {body.rows.length === 0 ? (
              <Empty text={body.empty} />
            ) : (
              body.rows.map((row) => (
                <div
                  key={row.key}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}
                >
                  <span
                    className="cf-catdot"
                    style={{ background: row.color ?? 'var(--cf-blue)', flex: 'none' }}
                  />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.label}
                  </span>
                  <span className="tnum" style={{ fontWeight: 600 }}>
                    {row.value}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    case 'bars': {
      // Room under the plot for the month labels.
      const labelBand = 18;
      return (
        <div>
          <svg
            width="100%"
            viewBox={`0 0 ${CARD_CHART_WIDTH} ${CARD_CHART_HEIGHT + labelBand}`}
            role="img"
            aria-label="Spending by period"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {/* The income reference line, drawn only when there is an income
                to reference — `ceilingY` sits at the chart floor otherwise. */}
            {body.ceilingY < CARD_CHART_HEIGHT ? (
              <line
                x1="0"
                y1={body.ceilingY}
                x2={CARD_CHART_WIDTH}
                y2={body.ceilingY}
                stroke="var(--cf-blue)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            ) : null}
            {body.bars.map((bar) => (
              <g key={bar.yearMonth}>
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  rx="4"
                  fill={
                    bar.empty ? 'var(--cf-surface-3)'
                    : bar.current ? 'var(--cf-ink)'
                    : 'var(--cf-blue-pale)'
                  }
                />
                <text
                  x={bar.x + bar.width / 2}
                  y={CARD_CHART_HEIGHT + 13}
                  textAnchor="middle"
                  fontSize="10"
                  fill={bar.current ? 'var(--cf-ink)' : 'var(--cf-muted)'}
                  fontWeight={bar.current ? 600 : 400}
                >
                  {bar.label}
                </text>
              </g>
            ))}
          </svg>
          <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 8 }}>{body.caption}</div>
        </div>
      );
    }
  }
}

function Row({ row }: { row: DashboardCardRow }): JSX.Element {
  const tone = row.alert ? 'var(--cf-danger)' : (row.color ?? 'var(--cf-blue)');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 600,
          }}
        >
          {row.label}
        </span>
        <span
          className="tnum"
          style={{ fontWeight: 600, color: row.alert ? 'var(--cf-danger-strong)' : 'var(--cf-ink)' }}
        >
          {row.value}
        </span>
      </div>
      {row.caption ? (
        <div style={{ fontSize: 11.5, color: 'var(--cf-muted)' }}>{row.caption}</div>
      ) : null}
      {row.share === undefined ? null : (
        <svg
          width="100%"
          height="5"
          viewBox="0 0 100 5"
          preserveAspectRatio="none"
          style={{ display: 'block' }}
          aria-hidden="true"
        >
          <rect x="0" y="0" width="100" height="5" rx="2.5" fill="var(--cf-surface-3)" />
          <rect
            x="0"
            y="0"
            width={Math.max(0, Math.min(1, row.share)) * 100}
            height="5"
            rx="2.5"
            fill={tone}
          />
        </svg>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }): JSX.Element {
  return <div style={{ fontSize: 12.5, color: 'var(--cf-muted)' }}>{text}</div>;
}
