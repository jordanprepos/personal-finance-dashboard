import { useState, type JSX } from 'react';
import {
  emptyExpenseForm,
  evaluateExpenseForm,
  expenseFormFrom,
  formatAmountInput,
  formatMoney,
  monthLabel,
  parseISODate,
  type ExpenseState,
  type ExpenseStore,
  type MoneyFormat,
  type Transaction,
} from '@expense-tracker/shared';

import { catStyle } from '../catStyle';

interface Props {
  store: ExpenseStore;
  state: ExpenseState;
  fmt: MoneyFormat;
  /** null when adding */
  transaction: Transaction | null;
  isRecurring: boolean;
  onClose: () => void;
  /** Close this sheet and open the Categories sheet. */
  onManageCategories: () => void;
}

const shortName = (name: string): string => name.split(/[\s&]+/)[0] ?? name;

export function ExpenseSheet({
  store,
  state,
  fmt,
  transaction,
  isRecurring,
  onClose,
  onManageCategories,
}: Props): JSX.Element {
  const defaultDay = state.yearMonth === state.today.slice(0, 7) ? parseISODate(state.today).day : 1;
  const [values, setValues] = useState(() =>
    transaction ? expenseFormFrom(transaction) : emptyExpenseForm(defaultDay),
  );

  const selectable = state.categories.filter((c) => !c.archived);
  const result = evaluateExpenseForm(values, state.yearMonth);
  const editing = transaction !== null;

  const submit = (): void => {
    if (!result.draft) return;
    if (transaction) void store.updateExpense(transaction.id, result.draft);
    else void store.addExpense(result.draft);
    onClose();
  };

  return (
    <div className="cf-scrim" onClick={onClose} role="presentation">
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
                <button
                  type="button"
                  className="cf-ghostbtn"
                  style={{ borderColor: 'var(--cf-blue)', color: 'var(--cf-blue)' }}
                  disabled={state.busy}
                  onClick={() => void store.addDefaultCategories()}
                >
                  Use my default categories
                </button>
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

        <div style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
          {editing
            ? 'Editing changes this entry only.'
            : values.repeat
              ? 'Written into every remaining month of the year as its own entry.'
              : `Logged once, in ${monthLabel(state.yearMonth)}.`}
        </div>

        <button
          type="button"
          className="cf-cta cf-cta--primary"
          style={{ padding: 15, opacity: result.valid ? 1 : 0.45 }}
          disabled={!result.valid || state.busy}
          onClick={submit}
        >
          {result.valid ? `Save ${formatMoney(result.amount, fmt)}` : 'Save expense'}
        </button>

        {editing && transaction ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 'var(--cf-r-pill)',
                border: '1.5px solid var(--cf-border-strong)',
                background: 'var(--cf-surface)',
                color: 'var(--cf-ink)',
                fontFamily: 'inherit',
                fontWeight: 600,
                fontSize: 13.5,
                cursor: 'pointer',
              }}
              onClick={() => {
                void store.deleteExpense(transaction);
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
                  background: 'var(--cf-ink)',
                  color: '#fff',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  void store.deleteExpenseSeries(transaction);
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
