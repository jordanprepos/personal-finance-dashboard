import type { JSX } from 'react';
import {
  formatAmountInput,
  formatMoney,
  formatPercent,
  parseAmountInput,
  type MoneyFormat,
  type WarnPct,
} from '@expense-tracker/shared';

import type { AlertSettingsProps } from '../types.js';
import { useCategoryLimitDraft } from '../useCategoryLimitDraft.js';
import { amountFieldText, useCommittedInput } from '../useCommittedInput.js';
import { CycleStartDayField, cycleStartDayHint } from './CycleStartDayField.js';
import { useDismiss } from '../useDismiss.js';

export type AlertSettingsModalProps = AlertSettingsProps;

const WARN_CHOICES: WarnPct[] = [70, 80, 90];

/**
 * Account settings: the tracking cycle, then the alerts — the on/off switch,
 * the monthly cap, the warning threshold, and the per-category caps.
 *
 * All of it lives on the profile, so it is the same on every month; what each
 * row *shows* — spend, percent used — is the period currently in view, and
 * arrives already derived so this stays a pure view of it.
 *
 * The cycle sits first because it decides what "this period" even means, which
 * every figure below is then measured against.
 */
export function AlertSettingsModal({
  alerts,
  cycleStartDay,
  cycleRangeLabel,
  rows,
  spentToDate,
  categories,
  fmt,
  onToggleEnabled,
  onSetMonthlyLimit,
  onSetWarnPct,
  onSetCycleStartDay,
  onSetCategoryLimit,
  onClearCategoryLimit,
  onClose,
}: AlertSettingsModalProps): JSX.Element {
  const { dismiss } = useDismiss({ onClose });

  const {
    pickedCategory,
    setPickedCategory,
    limitText,
    setLimitText,
    available,
    canAdd,
    addLimit,
  } = useCategoryLimitDraft({
    categories,
    categoryLimits: alerts.categoryLimits,
    onSetCategoryLimit,
  });

  return (
    <div className="cf-modal-scrim" style={{ zIndex: 56 }} onClick={dismiss} role="presentation">
      <div
        className="cf-modal cf-anim-in-fast"
        style={{ width: '100%', maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-.02em' }}>
            Settings
          </div>
          <span className="cf-spacer" />
          <button type="button" className="cf-back" onClick={onClose}>
            Close
          </button>
        </div>

        {/* tracking cycle */}
        <div>
          <div className="cf-fieldlabel">Cycle starts on day</div>
          <CycleStartDayField
            value={cycleStartDay}
            ariaLabel="Cycle start day"
            onCommit={onSetCycleStartDay}
          />
          <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 6 }}>
            {cycleStartDayHint(cycleRangeLabel)}
          </div>
        </div>

        {/* on/off */}
        <div className="dash__alertrow">
          <div className="dash__catnamecol">
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>Alerts</div>
            <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 1 }}>
              {alerts.enabled
                ? 'Watching this period against your limits.'
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
              ? `Spent ${formatMoney(spentToDate, fmt)} of this cap so far.`
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
              disabled={!canAdd}
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
                    color: row.used !== null && row.used > 1 ? 'var(--cf-danger-strong)' : 'var(--cf-slate)',
                  }}
                >
                  {/* No limit means no share to take — never NaN. */}
                  {row.used === null ? '—' : formatPercent(row.used)}
                </span>
                <button
                  type="button"
                  className="cf-dangerlink"
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
  const field = useCommittedInput({ value, format: amountFieldText, parse: parseAmountInput, onCommit });

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
        value={formatAmountInput(field.text, fmt)}
        onChange={(e) => field.setText(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={field.commit}
        onKeyDown={field.onKeyDown}
      />
    </div>
  );
}
