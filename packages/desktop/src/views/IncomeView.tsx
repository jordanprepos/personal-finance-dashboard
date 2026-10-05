import { useState, type JSX } from 'react';
import {
  expectedIncome,
  formatMoney,
  formatPercent,
  INCOME_KIND_LABELS,
  INCOME_CADENCE_LABELS,
  INCOME_EMPTY_LABELS,
  incomeBreakdown,
  incomeStatus,
  monthLabel,
  type Income,
  type IncomeShare,
  type MoneyFormat,
} from '@expense-tracker/shared';

import { type ViewProps } from '../appTypes';
import { IncomeModal } from '@expense-tracker/design-system';

type Filter = 'all' | 'active' | 'paused';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
];

/**
 * The Income page: every source funding the month, what they add up to, and
 * how dependable that total is.
 *
 * A page of its own rather than a panel on the Monthly tab — it carries a
 * list, a composition bar and three summary cards, which is more than the
 * dashboard's rail can hold and more than belongs beside the envelopes. The
 * toolbar's Income button is the way in; the tab strip stays visible, so the
 * way back is the same click as any other view.
 *
 * A source carries a cadence, a reliability and a pay day as well as an
 * amount, so editing lives in `IncomeModal`. What stays in the row is what can
 * be decided at a glance — pause, resume, remove.
 *
 * Everything shown here is derived in `shared/lib/derive.ts`; this file only
 * lays it out. The last remaining source has no Remove button:
 * `ExpenseStore.deleteIncome` refuses it anyway, and offering a button that
 * can only produce a toast is worse than not offering one.
 */
export function IncomeView({ store, state, fmt }: ViewProps): JSX.Element {
  const { budget, yearMonth } = state;
  const breakdown = incomeBreakdown(budget);
  const expected = expectedIncome(budget, yearMonth, state.profile.cycleStartDay);

  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Income | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const rows = breakdown.sources.filter((s) =>
    filter === 'all' ? true : filter === 'active' ? !s.paused : s.paused,
  );

  const openAdd = (): void => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (source: Income): void => {
    setEditing(source);
    setModalOpen(true);
  };

  return (
    <div className="dash__income">
      <div className="dash__incomehead">
        <div>
          <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-.03em' }}>
            Income sources
          </div>
          <div style={{ fontSize: 13, color: 'var(--cf-muted)', marginTop: 3 }}>
            {monthLabel(yearMonth)} · {breakdown.activeCount} active, {breakdown.pausedCount} paused
          </div>
        </div>
        <span className="cf-spacer" />
        <div className="cf-opts">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`cf-cat ${filter === f.value ? 'cf-cat--active' : 'cf-cat--idle'}`}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" className="cf-add" style={{ height: 38 }} onClick={openAdd}>
          + Add source
        </button>
      </div>

      <div className="dash__incomebody">
        <div className="dash__incomelist">
          {breakdown.composition.length > 0 ? (
            <div className="dash__incomecard">
              <div className="cf-fieldlabel">Composition</div>
              <div className="dash__incomebar">
                {breakdown.composition.map((s) => (
                  <div
                    key={s.id}
                    style={{ width: `${s.share * 100}%`, background: s.color }}
                    title={`${s.name} ${formatPercent(s.share)}`}
                  />
                ))}
              </div>
              <div className="dash__incomelegend">
                {breakdown.composition.map((s) => (
                  <div key={s.id} className="dash__incomekey">
                    <span className="dash__incomedot" style={{ background: s.color }} />
                    <span>{s.name}</span>
                    <span className="tnum" style={{ color: 'var(--cf-muted)' }}>
                      {formatPercent(s.share)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                fmt={fmt}
                canRemove={breakdown.sources.length > 1}
                onEdit={() => openEdit(source)}
                onPause={() => void store.setIncomePaused(source.id, !source.paused)}
                onRemove={() => void store.deleteIncome(source.id)}
              />
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="dash__incomeempty">
              {breakdown.sources.length === 0
                ? INCOME_EMPTY_LABELS['no-sources']
                : 'No sources match this filter.'}
            </div>
          ) : null}
        </div>

        <div className="dash__incomeside">
          <div className="cf-darkcard" style={{ minWidth: 0 }}>
            <div className="cf-darkcard__eyebrow">Monthly income</div>
            <div className="tnum cf-darkcard__title">{formatMoney(breakdown.total, fmt)}</div>
            <div className="cf-darkcard__sub">
              {breakdown.activeCount} active{' '}
              {breakdown.activeCount === 1 ? 'source' : 'sources'}
              {breakdown.pausedCount > 0 ? ` · ${breakdown.pausedCount} paused` : ''}
            </div>
            <div style={{ marginTop: 22 }}>
              <svg width="100%" height="8" viewBox="0 0 100 8" preserveAspectRatio="none">
                <rect x="0" y="0" width="100" height="8" rx="4" fill="rgba(255,255,255,.16)" />
                <rect
                  x="0"
                  y="0"
                  width={breakdown.receivedShare * 100}
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
                <span>Received {formatMoney(breakdown.received, fmt)}</span>
                {/* Nothing to take a share of when no source is active. */}
                <span>{breakdown.total > 0 ? formatPercent(breakdown.receivedShare) : '—'}</span>
              </div>
            </div>
          </div>

          <div className="dash__incomecard">
            <div className="cf-fieldlabel">Stability</div>
            <div className="tnum" style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-.02em' }}>
              {breakdown.total > 0 ? `${formatPercent(breakdown.fixedShare)} fixed` : '—'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', marginTop: 2 }}>
              {breakdown.total === 0
                ? 'No active source to measure.'
                : breakdown.fixedShare >= 0.7
                  ? 'Most of the month is predictable.'
                  : 'A large share depends on work that varies.'}
            </div>
            <div className="dash__incomesplit">
              <SplitRow label="Fixed" value={formatMoney(breakdown.fixed, fmt)} />
              <SplitRow label="Variable" value={formatMoney(breakdown.variable, fmt)} />
              <SplitRow
                label="Paused"
                value={breakdown.paused > 0 ? formatMoney(breakdown.paused, fmt) : '—'}
              />
            </div>
          </div>

          {/* Hidden when there are no sources at all, which the list's own
              empty state already says — as on the phone. */}
          {expected.empty?.reason === 'no-sources' ? null : (
            <div className="dash__incomecard">
              <div className="cf-fieldlabel">Expected next</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {expected.items.map((u) => (
                  <div key={u.id} className="dash__incomenext">
                    <span className="dash__incomeday">{u.dateLabel}</span>
                    <span className="dash__incomenextname">{u.name}</span>
                    <span className="tnum" style={{ fontWeight: 600 }}>
                      {formatMoney(u.amount, fmt)}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 12 }}>
                {/* Why nothing is listed comes from `derive.expectedIncome`,
                    shared with the phone and the Income expected card. */}
                {expected.empty
                  ? expected.empty.label
                  : `${formatMoney(expected.stillToLand, fmt)} still to land.`}
              </div>
            </div>
          )}
        </div>
      </div>

      {modalOpen ? (
        <IncomeModal
          fmt={fmt}
          yearMonth={yearMonth}
          editing={editing}
          onSave={(draft, source) => {
            if (source) void store.updateIncome(source.id, draft);
            else void store.addIncome({ ...draft, paused: false });
          }}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </div>
  );
}

function SplitRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ display: 'flex' }}>
      <span style={{ flex: 1, color: 'var(--cf-slate)' }}>{label}</span>
      <span className="tnum" style={{ fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

function SourceRow({
  source,
  fmt,
  canRemove,
  onEdit,
  onPause,
  onRemove,
}: {
  source: IncomeShare;
  fmt: MoneyFormat;
  canRemove: boolean;
  onEdit: () => void;
  onPause: () => void;
  onRemove: () => void;
}): JSX.Element {
  const status = incomeStatus(source);
  const cadence = INCOME_CADENCE_LABELS[source.cadence];

  return (
    <div className="dash__incomerow" style={{ opacity: source.paused ? 0.6 : 1 }}>
      <span className="dash__incomerail" style={{ background: source.color }} />

      <div className="dash__incomemain">
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 15.5, letterSpacing: '-.01em' }}>
            {source.name}
          </span>
          <span className="cf-badge">{INCOME_KIND_LABELS[source.kind]}</span>
        </div>
        <div className="dash__incomenote">
          {cadence} · day {source.day}
          {source.note ? ` · ${source.note}` : ''}
        </div>
      </div>

      <div className="dash__incomeamount">
        <div className="tnum" style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-.02em' }}>
          {/* The stored amount is one payment — say so when that is not a month. */}
          {formatMoney(source.amount, fmt)}
          {source.cadence === 'quarterly' ? ' /q' : ''}
        </div>
        <div className="tnum dash__incomeshare">
          {source.paused ? '— paused' : `${formatPercent(source.share)} of income`}
        </div>
      </div>

      <span className={`cf-status cf-status--${status.tone}`}>
        <span className="cf-status__dot" />
        {status.label}
      </span>

      <div className="cf-opts">
        <button type="button" className="cf-opt cf-opt--off" onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          className="cf-opt cf-opt--off"
          onClick={onPause}
          aria-label={`${source.paused ? 'Resume' : 'Pause'} ${source.name}`}
        >
          {source.paused ? 'Resume' : 'Pause'}
        </button>
        {canRemove ? (
          <button
            type="button"
            className="cf-dangerlink"
            style={{ padding: '9px 4px' }}
            aria-label={`Remove ${source.name}`}
            onClick={onRemove}
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
