import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  bucketByMonth,
  categoryOf,
  categoryTotals,
  envelopesByType,
  evaluateAlerts,
  filterTransactions,
  formatMoney,
  formatMoneyShort,
  indexCategories,
  categoryLimitRows,
  entryCountsByCategory,
  monthLabel,
  monthSummary,
  periodRangeLabel,
  sumAmounts,
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

import { catStyle } from '@expense-tracker/design-system';
import { useAuth, useStore } from './useStore';
import { LoginView } from './components/LoginView';
import { ExpenseSheet } from '@expense-tracker/design-system';

import { AlertSheet, CategorySheet } from '@expense-tracker/design-system';
import { IncomeTab } from './components/IncomeTab';
import { MobileAlertBanners as AlertBanners } from '@expense-tracker/design-system';

type Tab = 'daily' | 'monthly' | 'yearly' | 'income';

/**
 * The nav's primary group. Income sits with them rather than beside
 * Categories and Alerts because it is a page like these three, not a sheet.
 */
const TABS: [Tab, string][] = [
  ['daily', 'Today'],
  ['monthly', 'Month'],
  ['yearly', 'Year'],
  ['income', 'Income'],
];

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
  const [alertsOpen, setAlertsOpen] = useState(false);

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
  const alerts = evaluateAlerts({
    yearMonth,
    transactions: monthTransactions,
    categories,
    alerts: state.profile.alerts,
    // Money is formatted in the profile's locale; the month *name* is not.
    // `monthLabel` in the month nav above is en-US, so a banner saying
    // "for Agustus" under a header saying "August 2026" would read as a bug.
    fmt,
  });
  const present = categories.filter((c) => monthTransactions.some((t) => t.categoryId === c.id));

  const openAdd = (): void => {
    setEditing(null);
    setSheetOpen(true);
  };

  return (
    <div className="cf-phone">
      <div className="phone__status">
        <span>{state.mode === 'firestore' ? 'live' : 'demo'}</span>
        <span className="phone__period">
          {monthLabel(yearMonth)}
          {/* Empty on calendar months, where the label already says it all. */}
          {periodRangeLabel(state) ? (
            <span className="phone__periodrange">{periodRangeLabel(state)}</span>
          ) : null}
        </span>
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

        {/* Above the tab content and outside the switch, so Today, Month and
            Year all show the same alerts. */}
        <AlertBanners alerts={alerts} onOpenSettings={() => setAlertsOpen(true)} />

        {tab === 'daily' ? (
          <>
            <div className="phone__chiprow">
              <button
                type="button"
                className={`cf-catchip${categoryId === null ? ' cf-catchip--on' : ''}`}
                style={{ minHeight: 44 }}
                onClick={() => setCategoryId(null)}
              >
                All
              </button>
              {present.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`cf-catchip${categoryId === c.id ? ' cf-catchip--on' : ''}`}
                  style={{ ...catStyle(c.color), minHeight: 44 }}
                  onClick={() => setCategoryId(c.id)}
                >
                  <span className="cf-catdot" />
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
                    <div
                      className="cf-line__opts cf-catname"
                      style={catStyle(categoryOf(index, t.categoryId).color)}
                    >
                      <span className="cf-catdot" />
                      <span>
                        {categoryOf(index, t.categoryId).name} · {Number(t.date.slice(8))}{' '}
                        {shortMonthLabel(t.yearMonth)}
                        {t.seriesId !== null ? ' · recurring' : ''}
                      </span>
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

        {tab === 'monthly' ? <MonthTab state={state} fmt={fmt} /> : null}
        {tab === 'yearly' ? <YearTab store={store} state={state} fmt={fmt} /> : null}
        {tab === 'income' ? <IncomeTab store={store} state={state} fmt={fmt} /> : null}
      </div>

      <div className="phone__nav">
        <div className="phone__navgroup">
          {TABS.map(([value, label]) => (
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
          <span className="phone__navsep" aria-hidden="true" />
          <button
            type="button"
            className="phone__navbtn"
            style={{ color: 'var(--cf-muted)' }}
            onClick={() => setCategoriesOpen(true)}
          >
            Categories
          </button>
          <button
            type="button"
            className="phone__navbtn"
            style={{ color: 'var(--cf-muted)' }}
            onClick={() => setAlertsOpen(true)}
          >
            Settings
          </button>
        </div>
        <span className="cf-spacer" />
        <button type="button" className="cf-fab" aria-label="Add expense" onClick={openAdd}>
          +
        </button>
      </div>

      {sheetOpen ? (
        <ExpenseSheet
          yearMonth={state.yearMonth}
          today={state.today}
          cycleStartDay={state.profile.cycleStartDay}
          categories={state.categories}
          busy={state.busy}
          fmt={fmt}
          onSave={(draft, entry) => {
            if (entry) void store.updateExpense(entry.id, draft);
            else void store.addExpense(draft);
          }}
          onDelete={(entry) => void store.deleteExpense(entry)}
          onDeleteSeries={(entry) => void store.deleteExpenseSeries(entry)}
          onAddDefaultCategories={() => void store.addDefaultCategories()}
          transaction={editing}
          isRecurring={editing !== null && editing.seriesId !== null}
          onClose={() => {
            setSheetOpen(false);
            setEditing(null);
          }}
          onManageCategories={() => {
            setSheetOpen(false);
            setEditing(null);
            setCategoriesOpen(true);
          }}
        />
      ) : null}

      {categoriesOpen ? (
        <CategorySheet
          categories={state.categories}
          entryCounts={entryCountsByCategory(state.yearTransactions)}
          allocations={state.budget?.categoryBudgets ?? {}}
          yearMonth={state.yearMonth}
          busy={state.busy}
          fmt={fmt}
          onAddCategory={(name, type, allocation) =>
            void store.addCategory(name, type, allocation)
          }
          onDeleteCategory={(category) => void store.deleteCategory(category)}
          onAddDefaultCategories={() => void store.addDefaultCategories()}
          onClose={() => setCategoriesOpen(false)}
        />
      ) : null}

      {alertsOpen ? (
        <AlertSheet
          alerts={state.profile.alerts}
          cycleStartDay={state.profile.cycleStartDay}
          cycleRangeLabel={periodRangeLabel(state)}
          rows={categoryLimitRows(state.profile.alerts, state.monthTransactions, state.categories)}
          monthSpend={sumAmounts(state.monthTransactions)}
          categories={state.categories}
          fmt={fmt}
          onToggleEnabled={(enabled) => void store.setAlertsEnabled(enabled)}
          onSetMonthlyLimit={(amount) => void store.setMonthlyLimit(amount)}
          onSetWarnPct={(pct) => void store.setWarnPct(pct)}
          onSetCycleStartDay={(day) => void store.setCycleStartDay(day)}
          onSetCategoryLimit={(name, amount) => void store.setCategoryLimit(name, amount)}
          onClearCategoryLimit={(name) => void store.clearCategoryLimit(name)}
          onClose={() => setAlertsOpen(false)}
        />
      ) : null}

      {state.toast ? <div className="cf-toast cf-anim-in-fast">{state.toast}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------- month tab */

function MonthTab({
  state,
  fmt,
}: {
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
      {groups.map(([label, envelopes]) =>
        envelopes.length === 0 ? null : (
          <div key={label}>
            <div className="cf-group__label">{label} envelopes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {envelopes.map((e) => (
                <div
                  key={e.categoryId}
                  className="cf-tile cf-tile--cat"
                  style={{ ...catStyle(e.color), gap: 8, padding: 14 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="cf-catdot" />
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
  const buckets = bucketByMonth(year, state.yearTransactions, undefined, state.profile.cycleStartDay);

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
