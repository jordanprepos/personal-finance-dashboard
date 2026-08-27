import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  bucketByMonth,
  categoryOf,
  categoryTotals,
  envelopesByType,
  filterTransactions,
  formatAmountInput,
  formatMoney,
  formatMoneyShort,
  indexCategories,
  monthLabel,
  monthSummary,
  parseAmountInput,
  shortMonthLabel,
  stackSegments,
  yearOfMonth,
  type AuthController,
  type AuthState,
  type EnvRecord,
  type Envelope,
  type ExpenseStore,
  type MoneyFormat,
  type Transaction,
} from '@expense-tracker/shared';

import { useAuth, useStore } from './useStore';
import { LoginView } from './components/LoginView';
import { ExpenseSheet } from './components/ExpenseSheet';
import { CategorySheet } from './components/CategorySheet';

type Tab = 'daily' | 'monthly' | 'yearly';

/** "Health & Insurance" -> "Health" — chips are narrow on a phone. */
const shortName = (name: string): string => {
  const first = name.split(/[\s&]+/)[0] ?? name;
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
};

export function App({
  store,
  auth,
  env,
}: {
  store: ExpenseStore;
  auth: AuthController;
  env: EnvRecord | undefined;
}): JSX.Element {
  const authState = useAuth(auth);

  /*
   * The store follows the identity: loaded once per uid, dropped on sign-out
   * so a second account never renders the first one's rows. `unavailable`
   * means Firebase isn't configured — there is nothing to sign in to, so the
   * gate is skipped and the store loads seed data as it always did.
   */
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    const key =
      authState.status === 'signed-in' ? authState.userId
      : authState.status === 'unavailable' ? 'seed'
      : null;

    if (key === loadedFor.current) return;
    loadedFor.current = key;

    if (key === null) store.reset();
    else void store.init(env, authState.status === 'signed-in' ? key : undefined);
  }, [authState.status, authState.userId, store, env]);

  if (authState.status === 'checking') {
    return (
      <div className="cf-phone">
        <div className="phone__empty" style={{ margin: 'auto' }}>Loading…</div>
      </div>
    );
  }

  if (authState.status === 'signed-out') {
    return <LoginView auth={auth} state={authState} />;
  }

  return <Phone store={store} auth={auth} authState={authState} />;
}

function Phone({
  store,
  auth,
  authState,
}: {
  store: ExpenseStore;
  auth: AuthController;
  authState: AuthState;
}): JSX.Element {
  const state = useStore(store);
  const [tab, setTab] = useState<Tab>('daily');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const fmt: MoneyFormat = useMemo(
    () => ({ currency: state.profile.currency, locale: state.profile.locale }),
    [state.profile.currency, state.profile.locale],
  );
  const index = useMemo(() => indexCategories(state.categories), [state.categories]);

  if (state.status !== 'ready') {
    return (
      <div className="cf-phone">
        <div className="phone__empty" style={{ margin: 'auto', textAlign: 'center' }}>
          {state.status === 'loading' ? 'Loading…' : (state.error ?? 'Something went wrong.')}
          {/* Without this the failure is a dead end — there is no other way
              back to the login screen once the phone can't render. */}
          {state.status === 'error' && authState.status === 'signed-in' ? (
            <div style={{ marginTop: 16 }}>
              <button type="button" className="cf-ghostbtn" onClick={() => void auth.signOut()}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const { monthTransactions, categories, budget, yearMonth } = state;
  const summary = monthSummary(yearMonth, monthTransactions, budget);
  const totals = categoryTotals(monthTransactions, categories);
  const segments = stackSegments(totals, Math.max(summary.income, summary.spent));
  const shown = filterTransactions(monthTransactions, categories, { categoryId, query: '' });
  const present = categories.filter((c) => monthTransactions.some((t) => t.categoryId === c.id));

  const openAdd = (): void => {
    setEditing(null);
    setSheetOpen(true);
  };

  return (
    <div className="cf-phone">
      <div className="phone__status">
        <span>{state.mode === 'firestore' ? 'live' : 'demo'}</span>
        <span style={{ fontWeight: 600 }}>{monthLabel(yearMonth)}</span>
        {authState.status === 'signed-in' ? (
          <button type="button" className="phone__signout" onClick={() => void auth.signOut()}>
            Sign out
          </button>
        ) : null}
      </div>

      <div className="phone__scroll">
        <div style={{ flex: 'none' }}>
          <div className="cf-group__label" style={{ marginBottom: 2 }}>
            {summary.hasIncome ? 'Left to spend' : 'Spent this month'}
          </div>
          <div className="tnum phone__amount">
            {formatMoney(summary.hasIncome ? summary.left : summary.spent, fmt)}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--cf-slate)', marginTop: 4 }}>
            {summary.hasIncome
              ? `${formatMoney(summary.spent, fmt)} spent of ${formatMoney(summary.income, fmt)}`
              : 'No income set — add one on the Month tab.'}
          </div>
        </div>

        <svg
          width="100%"
          height="10"
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
          style={{ flex: 'none' }}
        >
          <rect
            x="0"
            y="0"
            width="100"
            height="10"
            rx="5"
            fill="var(--cf-surface)"
            stroke="var(--cf-border)"
            strokeWidth="1"
          />
          {segments.map((s) => (
            <rect key={s.categoryId} x={s.x} y="0" width={s.width} height="10" fill={s.color} />
          ))}
        </svg>

        {tab === 'daily' ? (
          <>
            <div className="phone__chiprow">
              <button
                type="button"
                className={`cf-cat ${categoryId === null ? 'cf-cat--active' : 'cf-cat--idle'}`}
                style={{ minHeight: 44 }}
                onClick={() => setCategoryId(null)}
              >
                All
              </button>
              {present.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`cf-cat ${categoryId === c.id ? 'cf-cat--active' : 'cf-cat--idle'}`}
                  style={{ minHeight: 44 }}
                  onClick={() => setCategoryId(c.id)}
                >
                  {shortName(c.name)}
                </button>
              ))}
            </div>

            <div className="phone__list">
              {shown.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="cf-line phone__entry"
                  onClick={() => {
                    setEditing(t);
                    setSheetOpen(true);
                  }}
                >
                  <div className="cf-line__body">
                    <div className="cf-line__name">{t.item}</div>
                    <div className="cf-line__opts">
                      {categoryOf(index, t.categoryId).name} · {Number(t.date.slice(8))}{' '}
                      {shortMonthLabel(t.yearMonth)}
                      {t.seriesId !== null ? ' · recurring' : ''}
                    </div>
                  </div>
                  <div
                    className="tnum"
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: t.amount === 0 ? 'var(--cf-muted)' : 'var(--cf-ink)',
                    }}
                  >
                    {t.amount === 0 ? 'no amount' : formatMoney(t.amount, fmt)}
                  </div>
                </button>
              ))}
              {shown.length === 0 ? <div className="phone__empty">Nothing here yet.</div> : null}
            </div>
          </>
        ) : null}

        {tab === 'monthly' ? <MonthTab store={store} state={state} fmt={fmt} /> : null}
        {tab === 'yearly' ? <YearTab store={store} state={state} fmt={fmt} /> : null}
      </div>

      <div className="phone__nav">
        <div className="phone__navgroup">
          {(
            [
              ['daily', 'Today'],
              ['monthly', 'Month'],
              ['yearly', 'Year'],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="phone__navbtn"
              style={{ color: tab === value ? 'var(--cf-blue)' : 'var(--cf-muted)' }}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="phone__navbtn"
            style={{ color: 'var(--cf-muted)' }}
            onClick={() => setCategoriesOpen(true)}
          >
            Categories
          </button>
        </div>
        <span className="cf-spacer" />
        <button type="button" className="cf-fab" aria-label="Add expense" onClick={openAdd}>
          +
        </button>
      </div>

      {sheetOpen ? (
        <ExpenseSheet
          store={store}
          state={state}
          fmt={fmt}
          transaction={editing}
          isRecurring={editing !== null && editing.seriesId !== null}
          onClose={() => {
            setSheetOpen(false);
            setEditing(null);
          }}
        />
      ) : null}

      {categoriesOpen ? (
        <CategorySheet
          store={store}
          state={state}
          fmt={fmt}
          onClose={() => setCategoriesOpen(false)}
        />
      ) : null}

      {state.toast ? <div className="cf-toast cf-anim-in-fast">{state.toast}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------- month tab */

function MonthTab({
  store,
  state,
  fmt,
}: {
  store: ExpenseStore;
  state: ReturnType<typeof useStore>;
  fmt: MoneyFormat;
}): JSX.Element {
  const { categories, monthTransactions, budget } = state;
  const groups: [string, Envelope[]][] = [
    ['Fixed', envelopesByType('fixed', categories, monthTransactions, budget)],
    ['Variable', envelopesByType('variable', categories, monthTransactions, budget)],
    ['Savings', envelopesByType('savings', categories, monthTransactions, budget)],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 'none' }}>
      <div>
        <div className="cf-group__label">Income this month</div>
        <IncomeField store={store} income={budget?.income ?? 0} fmt={fmt} />
      </div>
      {groups.map(([label, envelopes]) =>
        envelopes.length === 0 ? null : (
          <div key={label}>
            <div className="cf-group__label">{label} envelopes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {envelopes.map((e) => (
                <div key={e.categoryId} className="cf-tile" style={{ gap: 8, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14.5 }}>{e.name}</span>
                    <span className="cf-spacer" />
                    <span className="tnum" style={{ fontWeight: 700, fontSize: 15 }}>
                      {formatMoney(e.total, fmt)}
                    </span>
                  </div>
                  <svg width="100%" height="6" viewBox="0 0 100 6" preserveAspectRatio="none">
                    <rect x="0" y="0" width="100" height="6" rx="3" fill="var(--cf-surface-3)" />
                    <rect x="0" y="0" width={e.fill * 100} height="6" rx="3" fill={e.color} />
                  </svg>
                  <div style={{ fontSize: 11.5, color: 'var(--cf-muted)' }}>
                    {e.allocation === 0
                      ? 'no allocation set'
                      : e.over
                        ? `over by ${formatMoney(e.overBy, fmt)}`
                        : `of ${formatMoney(e.allocation, fmt)} allocated`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

/* -------------------------------------------------------------- year tab */

function YearTab({
  store,
  state,
  fmt,
}: {
  store: ExpenseStore;
  state: ReturnType<typeof useStore>;
  fmt: MoneyFormat;
}): JSX.Element {
  const year = yearOfMonth(state.yearMonth);
  const buckets = bucketByMonth(year, state.yearTransactions);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 'none' }}>
      <div className="cf-group__label">Spent per month · {year}</div>
      {buckets.map((bucket) => (
        <button
          key={bucket.yearMonth}
          type="button"
          className={`phone__monthrow${
            bucket.yearMonth === state.yearMonth ? ' phone__monthrow--current' : ''
          }`}
          onClick={() => void store.setYearMonth(bucket.yearMonth)}
        >
          <span style={{ fontWeight: 600, width: 44 }}>{bucket.label}</span>
          <span className="cf-spacer" />
          <span className="tnum" style={{ color: 'var(--cf-muted)', fontSize: 12 }}>
            {bucket.transactions.length} entries
          </span>
          <span className="tnum" style={{ fontWeight: 600, minWidth: 76, textAlign: 'right' }}>
            {bucket.total === 0 ? '—' : formatMoneyShort(bucket.total, fmt)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Writes budgets/{yearMonth}.income. */
function IncomeField({
  store,
  income,
  fmt,
}: {
  store: ExpenseStore;
  income: number;
  fmt: MoneyFormat;
}): JSX.Element {
  const [text, setText] = useState(income > 0 ? String(income) : '');
  useEffect(() => setText(income > 0 ? String(income) : ''), [income]);

  const commit = (): void => {
    const next = parseAmountInput(text);
    if (next !== income) void store.setIncome(next);
  };

  return (
    <input
      className="cf-input--phone tnum"
      inputMode="numeric"
      placeholder="Rp0"
      aria-label="Monthly income"
      value={formatAmountInput(text, fmt)}
      onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
