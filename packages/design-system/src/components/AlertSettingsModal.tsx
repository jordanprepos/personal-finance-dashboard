import { useEffect, useState, type JSX } from 'react';
import {
  formatAmountInput,
  formatMoney,
  formatPercent,
  parseAmountInput,
  type MoneyFormat,
  type WarnPct,
} from '@expense-tracker/shared';

import type { AlertSettingsProps } from '../types.js';

export type AlertSettingsModalProps = AlertSettingsProps;

const WARN_CHOICES: WarnPct[] = [70, 80, 90];

/**
 * Alert settings: the on/off switch, the monthly cap, the warning threshold,
 * and the per-category caps.
 *
 * The settings live on the profile, so they are the same on every month; what
 * each row *shows* — spend, percent used — is the month currently in view, and
 * arrives already derived so this stays a pure view of it.
 */
export function AlertSettingsModal({
  alerts,
  rows,
  monthSpend,
  categories,
  fmt,
  onToggleEnabled,
  onSetMonthlyLimit,
  onSetWarnPct,
  onSetCategoryLimit,
  onClearCategoryLimit,
  onClose,
}: AlertSettingsModalProps): JSX.Element {

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
    <div className="cf-modal-scrim" style={{ zIndex: 56 }} onClick={onClose} role="presentation">
      <div
        className="cf-modal cf-anim-in-fast"
        style={{ width: '100%', maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Alert settings"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-.02em' }}>
            Spending alerts
          </div>
          <span className="cf-spacer" />
          <button type="button" className="cf-back" onClick={onClose}>
            Close
          </button>
        </div>

        {/* on/off */}
        <div className="dash__alertrow">
          <div className="dash__catnamecol">
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>Alerts</div>
            <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 1 }}>
              {alerts.enabled
                ? 'Watching this month against your limits.'
                : 'Nothing is being evaluated.'}
            </div>
          </div>
          <button
            type="button"
            className={`cf-opt ${alerts.enabled ? 'cf-opt--on' : 'cf-opt--off'}`}
            aria-pressed={alerts.enabled}
            onClick={() => onToggleEnabled(!alerts.enabled)}
          >
            {alerts.enabled ? 'On' : 'Off'}
          </button>
        </div>

        {/* monthly cap */}
        <div>
          <div className="cf-fieldlabel">Monthly limit</div>
          <AmountField
            value={alerts.monthlyLimit}
            fmt={fmt}
            ariaLabel="Monthly limit"
            onCommit={onSetMonthlyLimit}
          />
          <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 6 }}>
            {alerts.monthlyLimit > 0
              ? `Spent ${formatMoney(monthSpend, fmt)} of this cap.`
              : 'No limit set — leave it at 0 to turn the monthly check off.'}
          </div>
        </div>

        {/* warn threshold */}
        <div>
          <div className="cf-fieldlabel">Warn me at</div>
          <div className="cf-opts">
            {WARN_CHOICES.map((pct) => (
              <button
                key={pct}
                type="button"
                className={`cf-opt ${alerts.warnPct === pct ? 'cf-opt--on' : 'cf-opt--off'}`}
                aria-pressed={alerts.warnPct === pct}
                onClick={() => onSetWarnPct(pct)}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* add a category cap */}
        <div>
          <div className="cf-fieldlabel">Limit one category</div>
          <div className="dash__limitform">
            <select
              className="cf-input--pos"
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
            <input
              className="cf-input--pos tnum"
              inputMode="numeric"
              placeholder="amount"
              aria-label="Category limit amount"
              value={formatAmountInput(limitText, fmt)}
              onChange={(e) => setLimitText(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addLimit();
              }}
            />
            <button
              type="button"
              className="cf-add"
              disabled={!pickedCategory || parseAmountInput(limitText) <= 0}
              onClick={addLimit}
            >
              Set
            </button>
          </div>
        </div>

        {/* existing category caps */}
        {rows.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="cf-fieldlabel" style={{ margin: 0 }}>
              Category limits
            </div>
            {rows.map((row) => (
              <div key={row.name} className="dash__catrow">
                <div className="dash__catnamecol">
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{row.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 1 }}>
                    {row.orphan
                      ? 'no category by this name any more'
                      : `${formatMoney(row.spent, fmt)} of ${formatMoney(row.limit, fmt)}`}
                  </div>
                </div>
                <span
                  className="tnum"
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: row.used !== null && row.used > 1 ? 'var(--cf-danger)' : 'var(--cf-slate)',
                  }}
                >
                  {/* No limit means no share to take — never NaN. */}
                  {row.used === null ? '—' : formatPercent(row.used)}
                </span>
                <button
                  type="button"
                  className="cf-back"
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

/**
 * A digits-only money input that commits on blur or Enter, matching the income
 * and allocation fields. Empty is 0, which is how a limit gets turned off.
 */
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
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
      <span
        className="tnum"
        style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-.02em', color: 'var(--cf-muted)' }}
      >
        Rp
      </span>
      <input
        className="tnum cf-amountinput"
        style={{ fontSize: 20 }}
        inputMode="numeric"
        placeholder="0"
        aria-label={ariaLabel}
        value={formatAmountInput(text, fmt)}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </div>
  );
}
