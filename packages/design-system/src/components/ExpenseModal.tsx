import { useState, type JSX } from 'react';
import {
  evaluateExpenseForm,
  emptyExpenseForm,
  expenseFormFrom,
  formatAmountInput,
  formatMoney,
  monthLabel,
  parseISODate,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from '@expense-tracker/shared';

import { catStyle } from '../catStyle.js';
import { DefaultCategoriesButton } from './DefaultCategoriesButton.js';
import type { ExpenseFormProps } from '../types.js';

export type ExpenseModalProps = ExpenseFormProps;

/**
 * The desktop add/edit expense dialog.
 *
 * Category and payment method are independent axes: the payment `<select>` is
 * its own field block rather than a second chip row, it sits outside
 * `.dash__formrow` (whose children are positioned by nth-child at the mobile
 * fold), and nothing here derives one from the other.
 */
export function ExpenseModal({
  yearMonth,
  today,
  categories,
  busy,
  fmt,
  transaction,
  isRecurring,
  onSave,
  onDelete,
  onDeleteSeries,
  onClose,
  onManageCategories,
  onAddDefaultCategories,
}: ExpenseModalProps): JSX.Element {
  const defaultDay = yearMonth === today.slice(0, 7) ? parseISODate(today).day : 1;
  const [values, setValues] = useState(() =>
    transaction ? expenseFormFrom(transaction) : emptyExpenseForm(defaultDay),
  );

  const result = evaluateExpenseForm(values, yearMonth);
  const editing = transaction !== null;
  const selectable = categories.filter((c) => !c.archived);

  const submit = (): void => {
    if (!result.draft) return;
    onSave(result.draft, transaction);
    onClose();
  };

  return (
    <div className="cf-modal-scrim" onClick={onClose} role="presentation">
      <div
        className="cf-modal cf-anim-in-fast"
        style={{ width: '100%', maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-.025em' }}>
            {editing ? 'Edit expense' : 'New expense'}
          </span>
          <span className="cf-spacer" />
          <span style={{ fontSize: 12.5, color: 'var(--cf-muted)' }}>
            {monthLabel(yearMonth)}
          </span>
        </div>

        <div>
          <div className="cf-fieldlabel">Amount</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span
              className="tnum"
              style={{
                fontWeight: 700,
                fontSize: 36,
                letterSpacing: '-.03em',
                color: 'var(--cf-muted)',
              }}
            >
              Rp
            </span>
            <input
              className="tnum cf-amountinput"
              style={{ fontSize: 36 }}
              inputMode="numeric"
              placeholder="0"
              autoFocus
              value={formatAmountInput(values.amountText, fmt)}
              onChange={(e) =>
                setValues({ ...values, amountText: e.target.value.replace(/[^0-9]/g, '') })
              }
            />
          </div>
          <div style={{ height: 1, background: 'var(--cf-border)', marginTop: 4 }} />
        </div>

        <div>
          <div className="cf-fieldlabel">Category</div>
          {/* A fresh account has no categories, and an expense can't be saved
              without one. Left as an empty row this is a dead end: Save stays
              dimmed with nothing on screen saying why. Mirrors the mobile
              sheet. */}
          {selectable.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontSize: 12.5, color: 'var(--cf-slate)' }}>
                No categories yet — every expense needs one.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* Fills the account from the spreadsheet's set; the chips then
                    appear in place, so the entry being typed isn't lost. */}
                <DefaultCategoriesButton busy={busy} onAdd={onAddDefaultCategories} />
                <button type="button" className="cf-ghostbtn" onClick={onManageCategories}>
                  Add my own
                </button>
              </div>
            </div>
          ) : (
            <div className="cf-opts">
              {selectable.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`cf-catchip${values.categoryId === c.id ? ' cf-catchip--on' : ''}`}
                  style={catStyle(c.color)}
                  onClick={() => setValues({ ...values, categoryId: c.id })}
                >
                  <span className="cf-catdot" />
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dash__formrow">
          <div>
            <div className="cf-fieldlabel">Item</div>
            <input
              className="cf-input--pos"
              style={{ width: '100%' }}
              placeholder="e.g. Token Listrik"
              value={values.item}
              onChange={(e) => setValues({ ...values, item: e.target.value })}
            />
          </div>
          <div>
            <div className="cf-fieldlabel">Day</div>
            <input
              className="cf-input--pos tnum"
              style={{ width: '100%' }}
              inputMode="numeric"
              value={values.dayText}
              onChange={(e) =>
                setValues({ ...values, dayText: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })
              }
            />
          </div>
          <div>
            <div className="cf-fieldlabel">Repeat</div>
            <button
              type="button"
              className="cf-input--pos"
              style={{
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                fontWeight: 600,
                color: values.repeat ? 'var(--cf-blue)' : 'var(--cf-slate)',
              }}
              onClick={() => setValues({ ...values, repeat: !values.repeat })}
              disabled={editing}
            >
              {values.repeat ? 'Monthly' : 'One-off'}
            </button>
          </div>
        </div>

        {/* Its own field block, deliberately not a fourth column of
            .dash__formrow (that grid positions children by nth-child at the
            mobile fold) and deliberately not a chip row like Category — a
            second chip row would read as a nested or derived category
            control. Payment method is a separate dimension: every option
            stays available whatever category is picked, and nothing here
            touches values.categoryId. */}
        <div>
          <div className="cf-fieldlabel">Paid with</div>
          <select
            className="cf-input--pos"
            style={{ width: '100%', cursor: 'pointer' }}
            aria-label="Payment method"
            value={values.paymentMethod}
            onChange={(e) =>
              setValues({ ...values, paymentMethod: e.target.value as PaymentMethod | '' })
            }
          >
            <option value="">Not set</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
          {editing
            ? 'Editing changes this entry only.'
            : values.repeat
              ? 'Written into every remaining month of the year as its own entry.'
              : `Logged once, in ${monthLabel(yearMonth)}.`}
        </div>

        {editing && transaction ? (
          <div
            style={{
              display: 'flex',
              gap: 10,
              borderTop: '1px solid var(--cf-border)',
              paddingTop: 14,
            }}
          >
            <button
              type="button"
              className="cf-cta cf-cta--outline"
              style={{ padding: 13, fontSize: 14 }}
              onClick={() => {
                onDelete(transaction);
                onClose();
              }}
            >
              Delete this entry
            </button>
            {isRecurring ? (
              <button
                type="button"
                className="cf-cta"
                style={{
                  padding: 13,
                  fontSize: 14,
                  border: 0,
                  background: 'var(--cf-ink)',
                  color: '#fff',
                }}
                onClick={() => {
                  onDeleteSeries(transaction);
                  onClose();
                }}
              >
                Delete this + future months
              </button>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="cf-cta cf-cta--outline"
            style={{ padding: 14 }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cf-cta cf-cta--primary"
            style={{ padding: 14 }}
            disabled={!result.valid || busy}
            onClick={submit}
          >
            {result.valid ? `Save ${formatMoney(result.amount, fmt)}` : 'Save expense'}
          </button>
        </div>
      </div>
    </div>
  );
}
