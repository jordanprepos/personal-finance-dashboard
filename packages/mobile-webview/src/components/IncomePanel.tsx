import { useEffect, useState, type JSX } from 'react';
import {
  formatAmountInput,
  formatMoney,
  formatShare,
  incomeShares,
  parseAmountInput,
  totalIncome,
  type ExpenseState,
  type ExpenseStore,
  type MoneyFormat,
} from '@expense-tracker/shared';

/**
 * The phone's Income panel: the month's sources, the total, and a form to add
 * one.
 *
 * Same store methods as the desktop panel — only the layout differs, stacking
 * each source over its amount so name and amount both keep a full-width tap
 * target instead of sharing a row.
 */
export function IncomePanel({
  store,
  state,
  fmt,
}: {
  store: ExpenseStore;
  state: ExpenseState;
  fmt: MoneyFormat;
}): JSX.Element {
  const sources = incomeShares(state.budget);
  const total = totalIncome(state.budget);

  const [name, setName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);

  const amount = parseAmountInput(amountText);
  const canAdd = name.trim() !== '' && amount > 0;

  const add = (): void => {
    if (!canAdd) return;
    void store.addIncome(name, amount, note);
    setName('');
    setAmountText('');
    setNote('');
    setAdding(false);
  };

  return (
    <div style={{ flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="cf-group__label">Income this month</div>
        <span className="cf-spacer" />
        <span className="tnum" style={{ fontWeight: 700, fontSize: 16 }}>
          {formatMoney(total, fmt)}
        </span>
      </div>

      <div className="phone__incomelist">
        {sources.map((source) => (
          <div key={source.id} className="phone__incomerow">
            <div className="phone__incomehead">
              <TextField
                value={source.name}
                ariaLabel={`Name of income source ${source.name}`}
                onCommit={(next) => void store.updateIncome(source.id, { name: next })}
              />
              {/* Nothing to take a share of when income is zero. */}
              <span className="tnum phone__incomeshare">
                {total > 0 ? formatShare(source.share, fmt.locale) : '—'}
              </span>
            </div>

            <div className="phone__incomefoot">
              <AmountField
                value={source.amount}
                fmt={fmt}
                ariaLabel={`Monthly amount for ${source.name}`}
                onCommit={(next) => void store.updateIncome(source.id, { amount: next })}
              />
              {/* The last source has no Delete — the store refuses it, so a
                  button here could only ever produce a toast. */}
              {sources.length > 1 ? (
                <button
                  type="button"
                  className="cf-back phone__tap"
                  aria-label={`Delete ${source.name}`}
                  onClick={() => void store.deleteIncome(source.id)}
                >
                  Delete
                </button>
              ) : null}
            </div>

            {source.note ? <div className="phone__incomenote">{source.note}</div> : null}
          </div>
        ))}

        {sources.length === 0 ? (
          <div className="phone__empty" style={{ padding: '10px 0' }}>
            No income for this month yet.
          </div>
        ) : null}
      </div>

      {adding ? (
        <div className="phone__incomeform">
          <input
            className="cf-input--phone"
            placeholder="Source name"
            aria-label="New income source name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="cf-input--phone tnum"
            inputMode="numeric"
            placeholder="Rp0"
            aria-label="New income source amount"
            value={formatAmountInput(amountText, fmt)}
            onChange={(e) => setAmountText(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <input
            className="cf-input--phone"
            placeholder="Note (optional)"
            aria-label="New income source note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="cf-add phone__tap"
              style={{ flex: 1 }}
              disabled={!canAdd}
              onClick={add}
            >
              Add source
            </button>
            <button
              type="button"
              className="cf-ghostbtn phone__tap"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="cf-ghostbtn phone__tap"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => setAdding(true)}
        >
          + Add income source
        </button>
      )}
    </div>
  );
}

/** Commit-on-blur text, reset whenever the stored value changes underneath. */
function TextField({
  value,
  ariaLabel,
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  onCommit: (next: string) => void;
}): JSX.Element {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const commit = (): void => {
    const next = text.trim();
    // An empty name is not a rename — put the old one back.
    if (!next) setText(value);
    else if (next !== value) onCommit(next);
  };

  return (
    <input
      className="cf-input--phone phone__incomename"
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/** Digits-only money input; empty means 0. */
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
