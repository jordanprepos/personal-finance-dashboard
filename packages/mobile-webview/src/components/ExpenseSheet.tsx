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

interface Props {
  store: ExpenseStore;
  state: ExpenseState;
  fmt: MoneyFormat;
  /** null when adding */
  transaction: Transaction | null;
  isRecurring: boolean;
  onClose: () => void;
}

const shortName = (name: string): string => name.split(/[\s&]+/)[0] ?? name;

export function ExpenseSheet({
  store,
  state,
  fmt,
  transaction,
  isRecurring,
  onClose,
}: Props): JSX.Element {
  const defaultDay = state.yearMonth === state.today.slice(0, 7) ? parseISODate(state.today).day : 1;
  const [values, setValues] = useState(() =>
    transaction ? expenseFormFrom(transaction) : emptyExpenseForm(defaultDay),
  );

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
          <div className="cf-opts">
            {state.categories
              .filter((c) => !c.archived)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`cf-opt ${values.categoryId === c.id ? 'cf-opt--on' : 'cf-opt--off'}`}
                  onClick={() => setValues({ ...values, categoryId: c.id })}
                >
                  {shortName(c.name)}
                </button>
              ))}
          </div>
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
