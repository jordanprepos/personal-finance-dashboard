import { useState, type JSX } from 'react';
import {
  emptyExpenseForm,
  evaluateExpenseForm,
  expenseFormFrom,
  cycleOf,
  formatAmountInput,
  formatMoney,
  monthLabel,
  SERIES_PERIODS,
  seriesExtendTarget,
  seriesLastPeriod,
  parseISODate,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from '@expense-tracker/shared';

import { DefaultCategoriesButton } from './DefaultCategoriesButton.js';
import { catStyle } from '../catStyle.js';
import type { ExpenseFormProps } from '../types.js';
import { useDismiss } from '../useDismiss.js';

export type ExpenseSheetProps = ExpenseFormProps;

/** Category names are shortened to their first word so a chip row fits a phone. */
const shortName = (name: string): string => name.split(/[\s&]+/)[0] ?? name;

/**
 * The mobile add/edit expense sheet — the same contract as the desktop modal,
 * laid out for a thumb: 44px targets, a single-column stack, and Save above
 * the destructive actions rather than beside them.
 */
export function ExpenseSheet({
  yearMonth,
  today,
  cycleStartDay,
  categories,
  accounts,
  busy,
  fmt,
  transaction,
  isRecurring,
  onSave,
  onDelete,
  onDeleteSeries,
  onExtendSeries,
  onClose,
  onManageCategories,
  onManageAccounts,
  onAddDefaultCategories,
}: ExpenseSheetProps): JSX.Element {
  // Today's day when the period in view is the live one, otherwise the day the
  // period opens on — which is `1` for a calendar month, as it always was.
  const defaultDay =
    yearMonth === cycleOf(today, cycleStartDay) ? parseISODate(today).day : cycleStartDay;
  const [initial] = useState(() =>
    transaction ? expenseFormFrom(transaction) : emptyExpenseForm(defaultDay),
  );
  const [values, setValues] = useState(initial);
  // Anything typed since opening — a tap on the scrim then refuses to close
  // the sheet, so a thumb grazing the dimmed page cannot throw an entry away.
  // Cancel still discards.
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const { dismiss, nudged } = useDismiss({ onClose, dirty });

  const selectable = categories.filter((c) => !c.archived);
  const result = evaluateExpenseForm(values, yearMonth, cycleStartDay);
  const editing = transaction !== null;

  const submit = (): void => {
    if (!result.draft) return;
    onSave(result.draft, transaction);
    onClose();
  };

  return (
    <div className="cf-scrim" onClick={dismiss} role="presentation">
      <div
        className="cf-sheet cf-anim-in-fast"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="cf-sheet__grab" />

        <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
          <span style={{ fontWeight: 700, fontSize: 19, letterSpacing: '-.02em' }}>
            {editing ? 'Edit expense' : 'New expense'}
          </span>
          <span className="cf-spacer" />
          <button type="button" className="cf-back" onClick={onClose}>
            Cancel
          </button>
        </div>

        {/* Up here, beside the Cancel it names: the sheet is taller than the
            screen, and a note at the foot would be out of sight of the tap
            above the sheet that raised it. */}
        {nudged ? (
          <div className="cf-unsaved" role="status" style={{ flex: 'none' }}>
            You have unsaved changes. Save them, or tap Cancel to discard.
          </div>
        ) : null}

        <div>
          <div className="cf-fieldlabel">Amount</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <span
              className="tnum"
              style={{
                fontWeight: 700,
                fontSize: 32,
                letterSpacing: '-.03em',
                color: 'var(--cf-muted)',
              }}
            >
              Rp
            </span>
            <input
              className="tnum cf-amountinput"
              style={{ fontSize: 32 }}
              inputMode="numeric"
              placeholder="0"
              value={formatAmountInput(values.amountText, fmt)}
              onChange={(e) =>
                setValues({ ...values, amountText: e.target.value.replace(/[^0-9]/g, '') })
              }
            />
          </div>
          <div style={{ height: 1, background: 'var(--cf-border)' }} />
        </div>

        <div>
          <div className="cf-fieldlabel">Category</div>
          {/* A fresh account has no categories, and an expense can't be saved
              without one. Left as an empty row this is a dead end: Save stays
              dimmed with nothing on screen saying why. */}
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
                  style={{ ...catStyle(c.color), minHeight: 44 }}
                  onClick={() => setValues({ ...values, categoryId: c.id })}
                >
                  <span className="cf-catdot" />
                  {shortName(c.name)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="cf-fieldlabel">Item</div>
          <input
            className="cf-input--phone"
            placeholder="e.g. Token Listrik"
            value={values.item}
            onChange={(e) => setValues({ ...values, item: e.target.value })}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="cf-fieldlabel">Day</div>
            <input
              className="cf-input--phone tnum"
              inputMode="numeric"
              value={values.dayText}
              onChange={(e) =>
                setValues({ ...values, dayText: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })
              }
            />
          </div>
          <div style={{ flex: 'none', width: 130 }}>
            <div className="cf-fieldlabel">Repeat</div>
            <button
              type="button"
              className="cf-input--phone"
              style={{
                textAlign: 'left',
                cursor: 'pointer',
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

        {/* A separate control from the category chips above, not a second
            chip row — payment method is an independent dimension, so every
            option stays available whatever category is picked and nothing
            here touches values.categoryId. */}
        <div>
          <div className="cf-fieldlabel">Paid with</div>
          <select
            className="cf-input--phone"
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

        {/* Which pot the money left — the third axis, and like "Paid with"
            above it is its own field block, never filtered by the category or
            the method, and never inferred from either. */}
        <div>
          <div className="cf-fieldlabel">Paid from</div>
          {accounts.length === 0 ? (
            <button
              type="button"
              className="cf-ghostbtn"
              style={{ width: '100%' }}
              onClick={onManageAccounts}
            >
              Add an account to track balances
            </button>
          ) : (
            <select
              className="cf-input--pos"
              style={{ width: '100%', cursor: 'pointer' }}
              aria-label="Source account"
              value={values.accountId}
              onChange={(e) => setValues({ ...values, accountId: e.target.value })}
            >
              <option value="">Not set</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              {/* Removing an account is a hard delete that deliberately leaves
                  the id on the transactions that named it. Without this the
                  select would bind to a value no option matches and render
                  blank, so the entry would silently look untagged — and the
                  reader could not tell whether saving would clear it. */}
              {values.accountId !== '' && !accounts.some((a) => a.id === values.accountId) ? (
                <option value={values.accountId}>Removed account</option>
              ) : null}
            </select>
          )}
        </div>

        <div style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
          {editing
            ? 'Editing changes this entry only.'
            : values.repeat
              ? `Written as its own entry for ${SERIES_PERIODS} months, ${monthLabel(yearMonth)} through ${monthLabel(seriesLastPeriod(yearMonth))}.`
              : `Logged once, in ${monthLabel(yearMonth)}.`}
        </div>

        {/* Which field is holding Save back — it used to dim with no reason
            given. Muted rather than red: an empty form is not a mistake. */}
        {result.hint ? (
          <div style={{ fontSize: 12.5, color: 'var(--cf-slate)' }}>{result.hint}</div>
        ) : null}

        <button
          type="button"
          className="cf-cta cf-cta--primary"
          style={{ padding: 15 }}
          disabled={!result.valid || busy}
          onClick={submit}
        >
          {result.valid ? `Save ${formatMoney(result.amount, fmt)}` : 'Save expense'}
        </button>

        {/* Continuing a run is its own action, above the destructive pair and
            apart from Save: it writes months after the run's last entry and
            never touches this one. The form stays open — closing would drop
            anything typed — and the toast says what was added. */}
        {editing && transaction && isRecurring ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 200px', fontSize: 12.5, color: 'var(--cf-slate)' }}>
              Part of a monthly run. Repeating adds months after its last entry.
            </span>
            <button
              type="button"
              className="cf-ghostbtn"
              style={{ flex: 'none', minHeight: 44 }}
              disabled={busy}
              onClick={() => onExtendSeries(transaction)}
            >
              Repeat through {monthLabel(seriesExtendTarget(today, cycleStartDay))}
            </button>
          </div>
        ) : null}

        {editing && transaction ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 'var(--cf-r-pill)',
                border: '1.5px solid var(--cf-danger-strong)',
                background: 'var(--cf-surface)',
                color: 'var(--cf-danger-strong)',
                fontFamily: 'inherit',
                fontWeight: 600,
                fontSize: 13.5,
                cursor: 'pointer',
              }}
              onClick={() => {
                onDelete(transaction);
                onClose();
              }}
            >
              Delete entry
            </button>
            {isRecurring ? (
              <button
                type="button"
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 'var(--cf-r-pill)',
                  border: 0,
                  // The louder half of a destructive pair: ink made the more
                  // dangerous of the two buttons the quieter-looking one.
                  background: 'var(--cf-danger-strong)',
                  color: 'var(--cf-surface)',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  onDeleteSeries(transaction);
                  onClose();
                }}
              >
                This + future
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
