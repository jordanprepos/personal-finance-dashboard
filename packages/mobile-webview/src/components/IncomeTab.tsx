import { useState, type JSX } from 'react';
import {
  expectedIncome,
  formatMoney,
  formatPercent,
  INCOME_CADENCE_LABELS,
  incomeBreakdown,
  incomeStatus,
  type ExpenseState,
  type ExpenseStore,
  type Income,
  type IncomeShare,
  type MoneyFormat,
} from '@expense-tracker/shared';

import { IncomeSheet } from '@expense-tracker/design-system';

type Filter = 'all' | 'active' | 'paused';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
];

/**
 * The phone's Income tab: the month's total, what it is made of, and each
 * source with the two actions worth a tap — edit and pause.
 *
 * A tab of its own rather than a block on Month, matching the desktop Income
 * page — it is a list to work through, and it was pushing the envelopes below
 * a scroll of summary cards.
 *
 * Same store methods and same derived values as the desktop page; only the
 * layout differs, stacking each source's figures over its status row so name,
 * amount and buttons all keep a full tap target instead of sharing one line.
 */
export function IncomeTab({
  store,
  state,
  fmt,
}: {
  store: ExpenseStore;
  state: ExpenseState;
  fmt: MoneyFormat;
}): JSX.Element {
  const { budget, yearMonth } = state;
  const breakdown = incomeBreakdown(budget);
  const expected = expectedIncome(budget, yearMonth, state.profile.cycleStartDay);

  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Income | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const rows = breakdown.sources.filter((s) =>
    filter === 'all' ? true : filter === 'active' ? !s.paused : s.paused,
  );

  const open = (source: Income | null): void => {
    setEditing(source);
    setSheetOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-.02em' }}>Income</span>
        <span className="cf-spacer" />
        <span className="cf-badge">{breakdown.activeCount} active</span>
      </div>

      <div className="cf-darkcard">
        <div className="cf-darkcard__eyebrow">Monthly income</div>
        <div className="tnum cf-darkcard__title">{formatMoney(breakdown.total, fmt)}</div>
        <div className="cf-darkcard__sub">
          {breakdown.activeCount} active {breakdown.activeCount === 1 ? 'source' : 'sources'}
          {breakdown.pausedCount > 0 ? ` · ${breakdown.pausedCount} paused` : ''}
        </div>
        {breakdown.composition.length > 0 ? (
          <div className="phone__incomebar">
            {breakdown.composition.map((s) => (
              <div key={s.id} style={{ width: `${s.share * 100}%`, background: s.colorOnDark }} />
            ))}
          </div>
        ) : null}
        <div className="phone__incomereceivedline">
          <span>Received {formatMoney(breakdown.received, fmt)}</span>
          {/* Nothing to take a share of when no source is active. */}
          <span>
            {breakdown.total > 0 ? `${formatPercent(breakdown.receivedShare)} so far` : '—'}
          </span>
        </div>
      </div>

      <div className="cf-opts">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`cf-cat phone__tap ${filter === f.value ? 'cf-cat--active' : 'cf-cat--idle'}`}
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((source) => (
          <SourceCard
            key={source.id}
            source={source}
            fmt={fmt}
            onEdit={() => open(source)}
            onPause={() => void store.setIncomePaused(source.id, !source.paused)}
          />
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="phone__empty">
          {breakdown.sources.length === 0 ? 'Nothing here yet.' : 'No sources match this filter.'}
        </div>
      ) : null}

      {/* Hidden only when there are no sources at all, which the list's own
          empty state above already says. Otherwise an empty list explains
          itself — all landed, or all paused — through the same
          `derive.expectedIncome` the desktop page and the card use. */}
      {expected.empty?.reason === 'no-sources' ? null : (
        <div className="phone__incomecard">
          <div className="cf-fieldlabel">Expected next</div>
          {expected.empty ? (
            <div style={{ fontSize: 12.5, color: 'var(--cf-slate)' }}>{expected.empty.label}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {expected.upcoming.map((u) => (
                <div key={u.id} className="phone__incomenext">
                  <span className="phone__incomeday">{u.dateLabel}</span>
                  <span className="phone__incomenextname">{u.name}</span>
                  <span className="tnum" style={{ fontWeight: 600 }}>
                    {formatMoney(u.amount, fmt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="cf-cta cf-cta--primary phone__tap"
        style={{ width: '100%', padding: 14 }}
        onClick={() => open(null)}
      >
        + Add income source
      </button>

      {sheetOpen ? (
        <IncomeSheet
          fmt={fmt}
          yearMonth={yearMonth}
          editing={editing}
          canRemove={breakdown.sources.length > 1}
          onSave={(draft, source) => {
            if (source) void store.updateIncome(source.id, draft);
            else void store.addIncome({ ...draft, paused: false });
          }}
          onRemove={(incomeId) => void store.deleteIncome(incomeId)}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </div>
  );
}

function SourceCard({
  source,
  fmt,
  onEdit,
  onPause,
}: {
  source: IncomeShare;
  fmt: MoneyFormat;
  onEdit: () => void;
  onPause: () => void;
}): JSX.Element {
  const status = incomeStatus(source);

  return (
    <div className="phone__incomerow" style={{ opacity: source.paused ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="phone__incomerail" style={{ background: source.color }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="phone__incomename">{source.name}</div>
          <div className="phone__incomenote">
            {INCOME_CADENCE_LABELS[source.cadence]} · day {source.day}
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div className="tnum" style={{ fontWeight: 700, fontSize: 15.5 }}>
            {formatMoney(source.amount, fmt)}
            {source.cadence === 'quarterly' ? ' /q' : ''}
          </div>
          <div className="tnum phone__incomeshare">
            {source.paused ? '—' : formatPercent(source.share)}
          </div>
        </div>
      </div>

      <div className="phone__incomefoot">
        <span className={`cf-status cf-status--${status.tone}`}>
          <span className="cf-status__dot" />
          {status.label}
        </span>
        <span className="cf-spacer" />
        <button type="button" className="cf-opt cf-opt--off phone__tap" onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          className="cf-opt cf-opt--off phone__tap"
          onClick={onPause}
          aria-label={`${source.paused ? 'Resume' : 'Pause'} ${source.name}`}
        >
          {source.paused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </div>
  );
}
