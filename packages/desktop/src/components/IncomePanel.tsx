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
 * The Income panel: every source funding the month, what they add up to, and
 * the form that adds another.
 *
 * Name and amount edit in place — the same commit-on-blur/Enter behaviour the
 * allocation fields use, so there is no save button to forget. The last
 * remaining source has no Delete: `ExpenseStore.deleteIncome` refuses it
 * anyway, and offering a button that will only produce a toast is worse than
 * not offering one.
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

  const amount = parseAmountInput(amountText);
  const canAdd = name.trim() !== '' && amount > 0;

  const add = (): void => {
    if (!canAdd) return;
    void store.addIncome(name, amount, note);
    setName('');
    setAmountText('');
    setNote('');
  };

  return (
    <div className="dash__income">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div className="cf-group__label" style={{ margin: 0 }}>
          Income
        </div>
        <span className="cf-spacer" />
        <div className="tnum dash__incometotal">{formatMoney(total, fmt)}</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
        {sources.length} {sources.length === 1 ? 'source' : 'sources'} this month
      </div>

      <div className="dash__incomelist">
        {sources.map((source) => (
          <div key={source.id} className="dash__incomerow">
            <div className="dash__incomemain">
              <TextField
                value={source.name}
                ariaLabel={`Name of income source ${source.name}`}
                onCommit={(next) => void store.updateIncome(source.id, { name: next })}
              />
              {source.note ? <div className="dash__incomenote">{source.note}</div> : null}
            </div>

            <AmountField
              value={source.amount}
              fmt={fmt}
              ariaLabel={`Monthly amount for ${source.name}`}
              onCommit={(next) => void store.updateIncome(source.id, { amount: next })}
            />

            {/* With no income at all there is no share to take — show a dash
                rather than a percentage of zero. */}
            <span className="tnum dash__incomeshare">
              {total > 0 ? formatShare(source.share, fmt.locale) : '—'}
            </span>

            {sources.length > 1 ? (
              <button
                type="button"
                className="cf-back dash__incomedel"
                aria-label={`Delete ${source.name}`}
                onClick={() => void store.deleteIncome(source.id)}
              >
                Delete
              </button>
            ) : (
              <span className="dash__incomedel" />
            )}
          </div>
        ))}

        {sources.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--cf-muted)' }}>
            No income for this month yet — add a source below.
          </div>
        ) : null}
      </div>

      <div className="dash__incomeform">
        <input
          className="cf-input--pos"
          placeholder="Source name"
          aria-label="New income source name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="cf-input--pos tnum"
          inputMode="numeric"
          placeholder="amount"
          aria-label="New income source amount"
          value={formatAmountInput(amountText, fmt)}
          onChange={(e) => setAmountText(e.target.value.replace(/[^0-9]/g, ''))}
        />
        <input
          className="cf-input--pos"
          placeholder="Note (optional)"
          aria-label="New income source note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        <button type="button" className="cf-add" disabled={!canAdd} onClick={add}>
          Add source
        </button>
      </div>
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
      className="cf-input--pos dash__incomename"
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
      className="cf-input--pos tnum dash__incomeamount"
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
  );
}
