import { useEffect, useState, type JSX } from 'react';
import {
  clampCycleStartDay,
  formatAmountInput,
  formatMoney,
  formatPercent,
  MAX_CYCLE_START_DAY,
  parseAmountInput,
  type MoneyFormat,
  type WarnPct,
} from '@expense-tracker/shared';

import type { AlertSettingsProps } from '../types.js';

export type AlertSheetProps = AlertSettingsProps;

const WARN_CHOICES: WarnPct[] = [70, 80, 90];

/**
 * Account settings as a bottom sheet — the phone's equivalent of the desktop
 * modal, driving exactly the same store methods.
 *
 * The settings are per account; the spend and percentages beside each limit
 * are for the period in view, and arrive already derived so this stays a pure
 * view of them. The tracking cycle comes first, since it is what decides which
 * period that is.
 */
export function AlertSheet({
  alerts,
  cycleStartDay,
  cycleRangeLabel,
  rows,
  monthSpend: spent,
  categories,
  fmt,
  onToggleEnabled,
  onSetMonthlyLimit,
  onSetWarnPct,
  onSetCycleStartDay,
  onSetCategoryLimit,
  onClearCategoryLimit,
  onClose,
}: AlertSheetProps): JSX.Element {

  const [pickedCategory, setPickedCategory] = useState('');
  const [limitText, setLimitText] = useState('');

  const capped = new Set(rows.map((r) => r.name.toLowerCase()));
  const available = categories.filter((c) => !capped.has(c.name.toLowerCase()));

  const addLimit = (): void => {
    const amount = parseAmountInput(limitText);
    if (!pickedCategory || amount <= 0) return;
    onSetCategoryLimit(pickedCategory, amount);
    setPickedCategory('');
    setLimitText('');
  };

  return (
    <div className="cf-scrim" onClick={onClose} role="presentation">
      <div
        className="cf-sheet cf-anim-in-fast"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="cf-sheet__grab" />

        <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
          <span style={{ fontWeight: 700, fontSize: 19, letterSpacing: '-.02em' }}>
            Settings
          </span>
          <span className="cf-spacer" />
          <button type="button" className="cf-back phone__tap" onClick={onClose}>
            Done
          </button>
        </div>

        <div style={{ flex: 'none' }}>
          <div className="cf-fieldlabel">Cycle starts on day</div>
          <DayField
            value={cycleStartDay}
            ariaLabel="Cycle start day"
            onCommit={onSetCycleStartDay}
          />
          <div style={{ fontSize: 11.5, color: 'var(--cf-muted)', marginTop: 4 }}>
            {cycleRangeLabel
              ? `${cycleRangeLabel} is one period. Set 1 for calendar months.`
              : 'Calendar months. Set the day you are paid to track salary to salary.'}
          </div>
        </div>

        <div className="phone__alertrow">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Alerts</div>
            <div style={{ fontSize: 11.5, color: 'var(--cf-muted)' }}>
              {alerts.enabled ? 'Watching this period.' : 'Nothing is evaluated.'}
            </div>
          </div>
          <button
            type="button"
            className={`cf-opt ${alerts.enabled ? 'cf-opt--on' : 'cf-opt--off'} phone__tap`}
            aria-pressed={alerts.enabled}
            onClick={() => onToggleEnabled(!alerts.enabled)}
          >
            {alerts.enabled ? 'On' : 'Off'}
          </button>
        </div>

        <div style={{ flex: 'none' }}>
          <div className="cf-fieldlabel">Monthly limit</div>
          <AmountField
            value={alerts.monthlyLimit}
            fmt={fmt}
            ariaLabel="Monthly limit"
            onCommit={onSetMonthlyLimit}
          />
          <div style={{ fontSize: 11.5, color: 'var(--cf-muted)', marginTop: 4 }}>
            {alerts.monthlyLimit > 0
              ? `${formatMoney(spent, fmt)} spent against it.`
              : 'Leave at 0 to turn the monthly check off.'}
          </div>
        </div>

        <div style={{ flex: 'none' }}>
          <div className="cf-fieldlabel">Warn me at</div>
          <div className="cf-opts">
            {WARN_CHOICES.map((pct) => (
              <button
                key={pct}
                type="button"
                className={`cf-opt ${alerts.warnPct === pct ? 'cf-opt--on' : 'cf-opt--off'} phone__tap`}
                aria-pressed={alerts.warnPct === pct}
                onClick={() => onSetWarnPct(pct)}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 'none' }}>
          <div className="cf-fieldlabel">Limit a category</div>
          <select
            className="cf-input--phone"
            aria-label="Category to limit"
            value={pickedCategory}
            onChange={(e) => setPickedCategory(e.target.value)}
          >
            <option value="">Choose a category…</option>
            {available.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              className="cf-input--phone tnum"
              inputMode="numeric"
              placeholder="Rp0"
              aria-label="Category limit amount"
              value={formatAmountInput(limitText, fmt)}
              onChange={(e) => setLimitText(e.target.value.replace(/[^0-9]/g, ''))}
            />
            <button
              type="button"
              className="cf-add phone__tap"
              style={{ flex: 'none' }}
              disabled={!pickedCategory || parseAmountInput(limitText) <= 0}
              onClick={addLimit}
            >
              Set
            </button>
          </div>
        </div>

        {rows.length > 0 ? (
          <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="cf-fieldlabel">Category limits</div>
            {rows.map((row) => (
              <div key={row.name} className="phone__alertrow">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{row.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--cf-muted)' }}>
                    {row.orphan
                      ? 'no category by this name'
                      : `${formatMoney(row.spent, fmt)} of ${formatMoney(row.limit, fmt)}`}
                  </div>
                </div>
                <span
                  className="tnum"
                  style={{
                    fontWeight: 600,
                    fontSize: 12.5,
                    color: row.used !== null && row.used > 1 ? 'var(--cf-danger)' : 'var(--cf-slate)',
                  }}
                >
                  {/* No limit, no share to take. */}
                  {row.used === null ? '—' : formatPercent(row.used)}
                </span>
                <button
                  type="button"
                  className="cf-back phone__tap"
                  onClick={() => onClearCategoryLimit(row.name)}
                >
                  Clear
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Digits-only money input; empty commits 0, which unsets the limit. */
/** The cycle start day — see the desktop modal's twin. */
function DayField({
  value,
  ariaLabel,
  onCommit,
}: {
  value: number;
  ariaLabel: string;
  onCommit: (next: number) => void;
}): JSX.Element {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = (): void => {
    const next = clampCycleStartDay(parseInt(text || '1', 10) || 1);
    setText(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      className="tnum cf-input--pos"
      style={{ width: 80 }}
      inputMode="numeric"
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      max={MAX_CYCLE_START_DAY}
    />
  );
}

function AmountField({
  value,
  fmt,
  ariaLabel,
  onCommit,
}: {
  value: number;
  fmt: MoneyFormat;
  ariaLabel: string;
  onCommit: (next: number) => void;
}): JSX.Element {
  const [text, setText] = useState(value > 0 ? String(value) : '');
  useEffect(() => setText(value > 0 ? String(value) : ''), [value]);

  const commit = (): void => {
    const next = parseAmountInput(text);
    if (next !== value) onCommit(next);
  };

  return (
    <input
      className="cf-input--phone tnum"
      inputMode="numeric"
      placeholder="Rp0"
      aria-label={ariaLabel}
      value={formatAmountInput(text, fmt)}
      onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
