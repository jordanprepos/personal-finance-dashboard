import { useEffect, useState, type JSX } from 'react';
import {
  ACCOUNT_TYPE_HINTS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  formatAmountInput,
  formatMoney,
  formatPercent,
  isLiabilityAccount,
  parseAmountInput,
  type Account,
  type AccountBalance,
  type AccountType,
  type MoneyFormat,
} from '@expense-tracker/shared';

import type { AccountManagerProps } from '../types.js';

/**
 * The accounts list plus its add form — the body both the desktop modal and
 * the mobile sheet wrap.
 *
 * Shared rather than written twice, like `DashboardCatalog`: this is one
 * scrolling list of rows on both surfaces, where the settings pair genuinely
 * lays its fields out differently on a phone. The two exported components
 * differ only in the shell, which is what keeps them honest about taking
 * identical props.
 *
 * **Reconcile is the primary action on every row**, not a field inside an edit
 * form. A projected balance is only ever as good as the last time it ran —
 * money arriving is invisible to an app that records expenses alone — so the
 * thing you will do most often is the thing that is one tap away.
 */
export function AccountsPanel({
  balances,
  today,
  busy,
  fmt,
  onAdd,
  onUpdate,
  onReconcile,
  onDelete,
}: Omit<AccountManagerProps, 'onClose'>): JSX.Element {
  const [adding, setAdding] = useState(false);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {balances.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--cf-muted)' }}>
            No accounts yet. Add the ones you spend from, then pick a source when logging an
            expense.
          </div>
        ) : (
          balances.map((b) => (
            <AccountRow
              key={b.account.id}
              balance={b}
              today={today}
              busy={busy}
              fmt={fmt}
              reconciling={reconciling === b.account.id}
              editing={editing === b.account.id}
              onStartReconcile={() => {
                setEditing(null);
                setReconciling(reconciling === b.account.id ? null : b.account.id);
              }}
              onStartEdit={() => {
                setReconciling(null);
                setEditing(editing === b.account.id ? null : b.account.id);
              }}
              onReconcile={(amount, asOf) => {
                onReconcile(b.account.id, amount, asOf);
                setReconciling(null);
              }}
              onUpdate={(patch) => {
                onUpdate(b.account.id, patch);
                setEditing(null);
              }}
              onDelete={() => onDelete(b.account)}
            />
          ))
        )}
      </div>

      {adding ? (
        <AddAccountForm
          busy={busy}
          fmt={fmt}
          onCancel={() => setAdding(false)}
          onAdd={(input) => {
            onAdd(input);
            setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="cf-add"
          style={{ alignSelf: 'flex-start' }}
          disabled={busy}
          onClick={() => setAdding(true)}
        >
          + Add account
        </button>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--cf-muted)', lineHeight: 1.5 }}>
        Balances are what you last confirmed, minus the expenses you tagged since. Money arriving
        is invisible here, so reconcile when you are paid.
      </div>
    </>
  );
}

function AccountRow({
  balance,
  today,
  busy,
  fmt,
  reconciling,
  editing,
  onStartReconcile,
  onStartEdit,
  onReconcile,
  onUpdate,
  onDelete,
}: {
  balance: AccountBalance;
  today: string;
  busy: boolean;
  fmt: MoneyFormat;
  reconciling: boolean;
  editing: boolean;
  onStartReconcile: () => void;
  onStartEdit: () => void;
  onReconcile: (amount: number, asOf: string) => void;
  onUpdate: (patch: { name?: string; limit?: number; monthlyPayment?: number }) => void;
  onDelete: () => void;
}): JSX.Element {
  const { account, projected, reconciled, reconciledOn, spentSince, entryCount, stale, ageInDays } =
    balance;
  const liability = isLiabilityAccount(account.type);
  // A stale reconciliation cannot be projected from, so the row shows the
  // figure that *was* confirmed rather than a number built on a window that
  // could not see the movements in between.
  const shown = stale ? reconciled : projected;

  return (
    <div
      className="cf-tile"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, borderLeft: `3px solid ${balance.color}` }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>{account.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--cf-muted)', marginTop: 1 }}>
            {ACCOUNT_TYPE_LABELS[account.type]}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            className="tnum"
            style={{
              fontWeight: 700,
              fontSize: 17,
              letterSpacing: '-.02em',
              color: liability && shown > 0 ? 'var(--cf-danger)' : 'var(--cf-ink)',
            }}
          >
            {formatMoney(shown, fmt)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cf-muted)', marginTop: 1 }}>
            {liability ? 'owed' : 'available'}
          </div>
        </div>
      </div>

      {/* The provenance line — never a bare number. What it was, when that was
          true, and what has happened since. */}
      <div style={{ fontSize: 11.5, color: stale ? 'var(--cf-danger)' : 'var(--cf-muted)' }}>
        {stale ? (
          <>Confirmed {reconciledOn || 'never'} — too far back to project from. Reconcile it.</>
        ) : (
          <>
            {formatMoney(reconciled, fmt)} on {reconciledOn}
            {entryCount > 0
              ? `, ${liability ? 'plus' : 'less'} ${formatMoney(spentSince, fmt)} across ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`
              : ', nothing logged since'}
            {ageInDays > 0 ? ` · ${ageInDays}d ago` : ' · today'}
          </>
        )}
      </div>

      {account.limit > 0 ? (
        <>
          <svg width="100%" height="5" viewBox="0 0 100 5" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y="0" width="100" height="5" rx="2.5" fill="var(--cf-surface-3)" />
            <rect
              x="0"
              y="0"
              width={Math.max(0, Math.min(1, balance.utilisation)) * 100}
              height="5"
              rx="2.5"
              fill={balance.utilisation > 0.8 ? 'var(--cf-danger)' : balance.color}
            />
          </svg>
          <div style={{ fontSize: 11.5, color: 'var(--cf-muted)' }}>
            {formatPercent(balance.utilisation)} of {formatMoney(account.limit, fmt)} limit
          </div>
        </>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="cf-add"
          style={{ minHeight: 36 }}
          disabled={busy}
          aria-expanded={reconciling}
          onClick={onStartReconcile}
        >
          Reconcile
        </button>
        <button type="button" className="cf-ghostbtn" disabled={busy} onClick={onStartEdit}>
          Edit
        </button>
        <span className="cf-spacer" />
        <button type="button" className="cf-back" disabled={busy} onClick={onDelete}>
          Remove
        </button>
      </div>

      {reconciling ? (
        <ReconcileForm
          current={shown}
          today={today}
          fmt={fmt}
          busy={busy}
          liability={liability}
          onSubmit={onReconcile}
        />
      ) : null}

      {editing ? (
        <EditForm account={account} fmt={fmt} busy={busy} onSubmit={onUpdate} />
      ) : null}
    </div>
  );
}

/**
 * Confirming a balance. Two fields, because they are meaningless apart: a
 * figure with no date attached cannot be projected from.
 */
function ReconcileForm({
  current,
  today,
  fmt,
  busy,
  liability,
  onSubmit,
}: {
  current: number;
  today: string;
  fmt: MoneyFormat;
  busy: boolean;
  liability: boolean;
  onSubmit: (amount: number, asOf: string) => void;
}): JSX.Element {
  const [text, setText] = useState(current > 0 ? String(current) : '');
  const [asOf, setAsOf] = useState(today);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderTop: '1px solid var(--cf-border)',
        paddingTop: 10,
      }}
    >
      <div className="cf-fieldlabel">
        {liability ? 'What the statement says you owe' : 'What the bank says you have'}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="cf-input--pos tnum"
          style={{ flex: '1 1 140px', minWidth: 0 }}
          inputMode="numeric"
          aria-label="Confirmed balance"
          placeholder="0"
          value={formatAmountInput(text, fmt)}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
        />
        <input
          className="cf-input--pos"
          style={{ flex: '0 1 150px' }}
          type="date"
          aria-label="As of date"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
        />
        <button
          type="button"
          className="cf-add"
          disabled={busy || !asOf}
          onClick={() => onSubmit(parseAmountInput(text), asOf)}
        >
          Confirm
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--cf-muted)' }}>
        Expenses dated on or after this will be subtracted from it.
      </div>
    </div>
  );
}

function EditForm({
  account,
  fmt,
  busy,
  onSubmit,
}: {
  account: Account;
  fmt: MoneyFormat;
  busy: boolean;
  onSubmit: (patch: { name?: string; limit?: number; monthlyPayment?: number }) => void;
}): JSX.Element {
  const [name, setName] = useState(account.name);
  const [limit, setLimit] = useState(account.limit > 0 ? String(account.limit) : '');
  const [payment, setPayment] = useState(
    account.monthlyPayment > 0 ? String(account.monthlyPayment) : '',
  );
  useEffect(() => setName(account.name), [account.name]);

  const liability = isLiabilityAccount(account.type);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderTop: '1px solid var(--cf-border)',
        paddingTop: 10,
      }}
    >
      <div className="cf-fieldlabel">Name</div>
      <input
        className="cf-input--pos"
        aria-label="Account name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {/* Limit and monthly payment only mean something on something that owes:
          an asset account has neither. */}
      {liability ? (
        <>
          <div className="cf-fieldlabel">Credit limit</div>
          <input
            className="cf-input--pos tnum"
            inputMode="numeric"
            aria-label="Credit limit"
            placeholder="0 — no limit"
            value={formatAmountInput(limit, fmt)}
            onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <div className="cf-fieldlabel">Monthly payment</div>
          <input
            className="cf-input--pos tnum"
            inputMode="numeric"
            aria-label="Monthly payment"
            placeholder="0"
            value={formatAmountInput(payment, fmt)}
            onChange={(e) => setPayment(e.target.value.replace(/[^0-9]/g, ''))}
          />
        </>
      ) : null}
      <button
        type="button"
        className="cf-add"
        style={{ alignSelf: 'flex-start' }}
        disabled={busy || name.trim() === ''}
        onClick={() =>
          onSubmit({
            name: name.trim(),
            ...(liability
              ? { limit: parseAmountInput(limit), monthlyPayment: parseAmountInput(payment) }
              : {}),
          })
        }
      >
        Save
      </button>
    </div>
  );
}

/** The type picker plus a starting balance — the design's "Add account" list. */
function AddAccountForm({
  busy,
  fmt,
  onAdd,
  onCancel,
}: {
  busy: boolean;
  fmt: MoneyFormat;
  onAdd: (input: {
    name: string;
    type: AccountType;
    balance: number;
    limit: number;
    monthlyPayment: number;
  }) => void;
  onCancel: () => void;
}): JSX.Element {
  const [type, setType] = useState<AccountType>('checking');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [limit, setLimit] = useState('');

  const liability = isLiabilityAccount(type);

  return (
    <div className="cf-tile" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="cf-fieldlabel" style={{ margin: 0 }}>
        Account type
      </div>
      <div className="cf-opts" style={{ flexWrap: 'wrap' }}>
        {ACCOUNT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`cf-opt ${type === t ? 'cf-opt--on' : 'cf-opt--off'}`}
            aria-pressed={type === t}
            onClick={() => setType(t)}
          >
            {ACCOUNT_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--cf-muted)' }}>{ACCOUNT_TYPE_HINTS[type]}</div>

      <div className="cf-fieldlabel">Name</div>
      <input
        className="cf-input--pos"
        aria-label="New account name"
        placeholder="e.g. BCA Daily"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="cf-fieldlabel">{liability ? 'Currently owed' : 'Current balance'}</div>
      <input
        className="cf-input--pos tnum"
        inputMode="numeric"
        aria-label="Starting balance"
        placeholder="0"
        value={formatAmountInput(balance, fmt)}
        onChange={(e) => setBalance(e.target.value.replace(/[^0-9]/g, ''))}
      />

      {liability ? (
        <>
          <div className="cf-fieldlabel">Credit limit</div>
          <input
            className="cf-input--pos tnum"
            inputMode="numeric"
            aria-label="New account credit limit"
            placeholder="0 — no limit"
            value={formatAmountInput(limit, fmt)}
            onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ''))}
          />
        </>
      ) : null}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="cf-add"
          disabled={busy || name.trim() === ''}
          onClick={() =>
            onAdd({
              name: name.trim(),
              type,
              balance: parseAmountInput(balance),
              limit: liability ? parseAmountInput(limit) : 0,
              monthlyPayment: 0,
            })
          }
        >
          Add account
        </button>
        <button type="button" className="cf-ghostbtn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--cf-muted)' }}>
        Taken as true today — expenses you tag from here on come off it.
      </div>
    </div>
  );
}
