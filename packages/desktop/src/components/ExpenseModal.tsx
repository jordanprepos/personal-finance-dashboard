import { useState, type JSX } from 'react';
import {
  CATEGORY_TYPES,
  evaluateExpenseForm,
  emptyExpenseForm,
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

export function ExpenseModal({
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
    <div className="cf-modal-scrim" onClick={onClose} role="presentation">
      <div
        className="cf-modal cf-anim-in-fast"
        style={{ width: 520 }}
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
            {monthLabel(state.yearMonth)}
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
                  {c.name}
                </button>
              ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 130px', gap: 12, alignItems: 'end' }}>
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

        <div style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
          {editing
            ? 'Editing changes this entry only.'
            : values.repeat
              ? 'Written into every remaining month of the year as its own entry.'
              : `Logged once, in ${monthLabel(state.yearMonth)}.`}
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
                void store.deleteExpense(transaction);
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
                  void store.deleteExpenseSeries(transaction);
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
            style={{ padding: 14, opacity: result.valid ? 1 : 0.45 }}
            disabled={!result.valid || state.busy}
            onClick={submit}
          >
            {result.valid ? `Save ${formatMoney(result.amount, fmt)}` : 'Save expense'}
          </button>
        </div>
      </div>
    </div>
  );
}

export { CATEGORY_TYPES };
