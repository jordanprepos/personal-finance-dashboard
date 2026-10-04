import { useState, type JSX } from 'react';
import {
  emptyIncomeForm,
  evaluateIncomeForm,
  formatAmountInput,
  INCOME_CADENCES,
  INCOME_CADENCE_LABELS,
  INCOME_KINDS,
  INCOME_KIND_LABELS,
  incomeFormFrom,
  MAX_INCOME_DAY,
  monthLabel,
} from '@expense-tracker/shared';

import type { IncomeEditorProps } from '../types.js';
import { useDismiss } from '../useDismiss.js';

export type IncomeModalProps = IncomeEditorProps;

/**
 * Add/edit one income source.
 *
 * Replaces the panel's old commit-on-blur fields: cadence, reliability and the
 * pay day have no sensible inline affordance, and splitting one source across
 * six always-live inputs made the list read as a form rather than as a list.
 *
 * Pausing is deliberately not a field here — it is a row action, so opening
 * this on a paused source and saving never quietly resumes it.
 */
export function IncomeModal({
  fmt,
  yearMonth,
  editing,
  onSave,
  onClose,
}: IncomeModalProps): JSX.Element {
  const [initial] = useState(() =>
    editing ? incomeFormFrom(editing) : emptyIncomeForm(),
  );
  const [values, setValues] = useState(initial);
  // As on the expense form: once something is typed, Escape and the scrim
  // refuse to close, and Cancel is the one way to discard.
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const { dismiss, nudged } = useDismiss({ onClose, dirty });
  const result = evaluateIncomeForm(values);

  // Functional update rather than spreading the render's `values`: two field
  // changes landing before a re-render would otherwise drop the first.
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]): void =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const save = (): void => {
    if (!result.draft) return;
    onSave(result.draft, editing);
    onClose();
  };

  return (
    <div className="cf-modal-scrim" style={{ zIndex: 60 }} onClick={dismiss} role="presentation">
      <div
        className="cf-modal cf-anim-in-fast"
        style={{ width: '100%', maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit income source' : 'New income source'}
      >
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-.025em' }}>
            {editing ? 'Edit source' : 'New income source'}
          </span>
          <span className="cf-spacer" />
          <span style={{ fontSize: 13, color: 'var(--cf-muted)' }}>
            {/* The list belongs to the month in view, so say which one. */}
            {editing ? `Changes apply to ${monthLabel(yearMonth)}` : `Added to ${monthLabel(yearMonth)}`}
          </span>
        </div>

        <div>
          <div className="cf-fieldlabel">Source name</div>
          <input
            className="cf-input--pos"
            style={{ width: '100%' }}
            placeholder="e.g. Freelance design"
            aria-label="Source name"
            autoFocus
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
          <div>
            <div className="cf-fieldlabel">Amount per payment</div>
            <input
              className="cf-input--pos tnum"
              style={{ width: '100%' }}
              inputMode="numeric"
              placeholder="0"
              aria-label="Amount per payment"
              value={formatAmountInput(values.amountText, fmt)}
              onChange={(e) => set('amountText', e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <div>
            <div className="cf-fieldlabel">Pay day</div>
            <input
              className="cf-input--pos tnum"
              style={{ width: '100%' }}
              inputMode="numeric"
              aria-label={`Pay day, 1 to ${MAX_INCOME_DAY}`}
              value={values.dayText}
              onChange={(e) => set('dayText', e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
        </div>

        <div>
          <div className="cf-fieldlabel">Cadence</div>
          <div className="cf-opts">
            {INCOME_CADENCES.map((c) => (
              <button
                key={c}
                type="button"
                className={`cf-cat ${values.cadence === c ? 'cf-cat--active' : 'cf-cat--idle'}`}
                aria-pressed={values.cadence === c}
                onClick={() => set('cadence', c)}
              >
                {INCOME_CADENCE_LABELS[c]}
              </button>
            ))}
          </div>
          {values.cadence === 'quarterly' ? (
            <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 8 }}>
              A third of the payment counts toward each month.
            </div>
          ) : null}
        </div>

        <div>
          <div className="cf-fieldlabel">Reliability</div>
          <div className="cf-opts">
            {INCOME_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`cf-cat ${values.kind === k ? 'cf-cat--active' : 'cf-cat--idle'}`}
                aria-pressed={values.kind === k}
                onClick={() => set('kind', k)}
              >
                {INCOME_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 8 }}>
            {values.kind === 'fixed'
              ? 'Counted in full when budgeting the month ahead.'
              : 'Counted the same, but flagged in the stability split.'}
          </div>
        </div>

        <div>
          <div className="cf-fieldlabel">Note</div>
          <input
            className="cf-input--pos"
            style={{ width: '100%' }}
            placeholder="e.g. Retainer, paid on invoice"
            aria-label="Note"
            value={values.note}
            onChange={(e) => set('note', e.target.value)}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--cf-surface-2)',
            border: '1px solid var(--cf-border)',
            borderRadius: 'var(--cf-r-tile)',
            padding: '13px 16px',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Already received this month</div>
            <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 1 }}>
              Counts toward what has landed so far
            </div>
          </div>
          <button
            type="button"
            className={`cf-opt ${values.received ? 'cf-opt--on' : 'cf-opt--off'}`}
            aria-pressed={values.received}
            onClick={() => set('received', !values.received)}
          >
            {values.received ? 'Yes' : 'Not yet'}
          </button>
        </div>

        {nudged ? (
          <div className="cf-unsaved" role="status">
            You have unsaved changes. Save them, or press Cancel to discard.
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="cf-cta cf-cta--outline"
            style={{ flex: 1, padding: 13 }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cf-cta cf-cta--primary"
            style={{ flex: 2, padding: 13 }}
            disabled={!result.valid}
            onClick={save}
          >
            {editing ? 'Save changes' : 'Add source'}
          </button>
        </div>
      </div>
    </div>
  );
}
