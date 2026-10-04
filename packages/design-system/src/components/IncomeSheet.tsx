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

export interface IncomeSheetProps extends IncomeEditorProps {
  /** false for the month's last source — a month always keeps one */
  canRemove: boolean;
  onRemove: (incomeId: string) => void;
}

/**
 * Add/edit one income source as a bottom sheet — the phone's equivalent of the
 * desktop `IncomeModal`, driving the same store methods and the same
 * `evaluateIncomeForm`, so the two can't validate differently.
 */
export function IncomeSheet({
  fmt,
  yearMonth,
  editing,
  canRemove,
  onSave,
  onRemove,
  onClose,
}: IncomeSheetProps): JSX.Element {
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
    <div className="cf-scrim" onClick={dismiss} role="presentation">
      <div
        className="cf-sheet cf-anim-in-fast"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit income source' : 'New income source'}
      >
        <div className="cf-sheet__grab" />

        <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
          <span style={{ fontWeight: 700, fontSize: 19, letterSpacing: '-.02em' }}>
            {editing ? 'Edit source' : 'New income source'}
          </span>
          <span className="cf-spacer" />
          <button type="button" className="cf-back phone__tap" onClick={onClose}>
            Cancel
          </button>
        </div>

        {/* Up here, beside the Cancel it names: a note at the foot of the
            sheet would be out of sight of the tap that raised it. */}
        {nudged ? (
          <div className="cf-unsaved" role="status" style={{ flex: 'none' }}>
            You have unsaved changes. Save them, or tap Cancel to discard.
          </div>
        ) : null}

        <div style={{ fontSize: 12, color: 'var(--cf-muted)', flex: 'none' }}>
          {editing ? `Changes apply to ${monthLabel(yearMonth)}` : `Added to ${monthLabel(yearMonth)}`}
        </div>

        <div className="phone__incomefields">
          <div>
            <div className="cf-fieldlabel">Source name</div>
            <input
              className="cf-input--phone"
              placeholder="e.g. Freelance design"
              aria-label="Source name"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 10 }}>
            <div>
              <div className="cf-fieldlabel">Amount per payment</div>
              <input
                className="cf-input--phone tnum"
                inputMode="numeric"
                placeholder="Rp0"
                aria-label="Amount per payment"
                value={formatAmountInput(values.amountText, fmt)}
                onChange={(e) => set('amountText', e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
            <div>
              <div className="cf-fieldlabel">Pay day</div>
              <input
                className="cf-input--phone tnum"
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
                  className={`cf-cat phone__tap ${values.cadence === c ? 'cf-cat--active' : 'cf-cat--idle'}`}
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
                  className={`cf-cat phone__tap ${values.kind === k ? 'cf-cat--active' : 'cf-cat--idle'}`}
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
              className="cf-input--phone"
              placeholder="e.g. Retainer, paid on invoice"
              aria-label="Note"
              value={values.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </div>

          <div className="phone__incomereceived">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Already received</div>
              <div style={{ fontSize: 11.5, color: 'var(--cf-muted)', marginTop: 1 }}>
                Counts toward what has landed
              </div>
            </div>
            <button
              type="button"
              className={`cf-opt phone__tap ${values.received ? 'cf-opt--on' : 'cf-opt--off'}`}
              aria-pressed={values.received}
              onClick={() => set('received', !values.received)}
            >
              {values.received ? 'Yes' : 'Not yet'}
            </button>
          </div>
        </div>

        {/* Removal lives in the sheet rather than on the row: the phone's row
            has space for the two everyday actions, and a destructive third
            one a thumb-width from Pause is the wrong place for it. */}
        {editing && canRemove ? (
          <button
            type="button"
            className="cf-dangerlink phone__tap"
            style={{ flex: 'none', alignSelf: 'flex-start' }}
            onClick={() => {
              onRemove(editing.id);
              onClose();
            }}
          >
            Remove this source
          </button>
        ) : null}

        <button
          type="button"
          className="cf-cta cf-cta--primary phone__tap"
          style={{ flex: 'none', width: '100%', padding: 15 }}
          disabled={!result.valid}
          onClick={save}
        >
          {editing ? 'Save changes' : 'Add source'}
        </button>
      </div>
    </div>
  );
}
