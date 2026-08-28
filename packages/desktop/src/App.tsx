import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  evaluateAlerts,
  monthLabel,
  shiftMonth,
  yearOfMonth,
  type AuthController,
  type AuthState,
  type EnvRecord,
  type MoneyFormat,
  type ExpenseStore,
  type Transaction,
} from '@expense-tracker/shared';

import type { Tab } from './appTypes';
import { useAuth, useStore } from './useStore';
import { LoginView } from './views/LoginView';
import { MonthlyView } from './views/MonthlyView';
import { DailyView } from './views/DailyView';
import { YearlyView } from './views/YearlyView';
import { ExpenseModal } from './components/ExpenseModal';
import { CategoryModal } from './components/CategoryModal';
import { AlertBanners } from './components/AlertBanners';
import { AlertSettingsModal } from './components/AlertSettingsModal';

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
    return <div className="dash__empty">Loading…</div>;
  }

  if (authState.status === 'signed-out') {
    return <LoginView auth={auth} state={authState} />;
  }

  return <Dashboard store={store} auth={auth} authState={authState} />;
}

function Dashboard({
  store,
  auth,
  authState,
}: {
  store: ExpenseStore;
  auth: AuthController;
  authState: AuthState;
}): JSX.Element {
  const state = useStore(store);
  const [tab, setTab] = useState<Tab>('monthly');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const fmt: MoneyFormat = useMemo(
    () => ({ currency: state.profile.currency, locale: state.profile.locale }),
    [state.profile.currency, state.profile.locale],
  );

  const openAdd = (): void => {
    setEditing(null);
    setExpenseOpen(true);
  };

  const openEdit = (transaction: Transaction): void => {
    setEditing(transaction);
    setExpenseOpen(true);
  };

  if (state.status === 'loading') {
    return <div className="dash__empty">Loading…</div>;
  }

  if (state.status === 'error') {
    return (
      <div className="dash__empty">
        Could not load your data.
        <div style={{ marginTop: 8, color: 'var(--cf-slate)' }}>{state.error}</div>
        {/* Without this the failure is a dead end — there is no other way back
            to the login screen once the dashboard can't render. */}
        {authState.status === 'signed-in' ? (
          <button
            type="button"
            className="cf-ghostbtn"
            style={{ marginTop: 16 }}
            onClick={() => void auth.signOut()}
          >
            Sign out
          </button>
        ) : null}
      </div>
    );
  }

  const alerts = evaluateAlerts({
    yearMonth: state.yearMonth,
    transactions: state.monthTransactions,
    categories: state.categories,
    alerts: state.profile.alerts,
    // Money is formatted in the profile's locale; the month *name* is not.
    // `monthLabel` in the month nav above is en-US, so a banner saying
    // "for Agustus" under a header saying "August 2026" would read as a bug.
    fmt,
  });

  const viewProps = { store, state, fmt, onEdit: openEdit, onAdd: openAdd };

  return (
    <div className="dash">
      <header className="dash__header">
        <span className="dash__brand">Alokasi Keuangan</span>
        <span style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
          {state.mode === 'firestore' ? 'live · Firestore' : 'demo data'}
        </span>
        {state.warning ? <span className="cf-banner">{state.warning}</span> : null}
        <span className="cf-spacer" />
        {authState.status === 'signed-in' ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--cf-muted)' }}>{authState.email}</span>
            <button type="button" className="cf-back" onClick={() => void auth.signOut()}>
              Sign out
            </button>
          </>
        ) : null}
      </header>

      <div className="dash__panel cf-panel">
        <div className="dash__body">
          {/*
            One toolbar, laid out two ways. On desktop `.dash__bar` is
            `display: contents`, so tabs / Categories / Add stay flex items of
            the toolbar and `order` puts them back where they were. Below the
            phone breakpoint the wrapper becomes the design's fixed bottom bar
            and the month nav is left alone at the top.
          */}
          <div className="dash__toolbar">
            <div className="dash__monthnav">
              <button
                type="button"
                className="cf-stepbtn"
                aria-label="Previous month"
                onClick={() => void store.setYearMonth(shiftMonth(state.yearMonth, -1))}
              >
                ‹
              </button>
              <span className="dash__monthlabel">{monthLabel(state.yearMonth)}</span>
              <button
                type="button"
                className="cf-stepbtn"
                aria-label="Next month"
                onClick={() => void store.setYearMonth(shiftMonth(state.yearMonth, 1))}
              >
                ›
              </button>
            </div>

            <div className="dash__bar">
              <div className="dash__tabs">
                {(['daily', 'monthly', 'yearly'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`cf-cat ${tab === t ? 'cf-cat--active' : 'cf-cat--idle'}`}
                    style={{ border: 0, textTransform: 'capitalize' }}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="cf-ghostbtn dash__catsbtn"
                onClick={() => setCategoriesOpen(true)}
              >
                Categories
              </button>
              <button
                type="button"
                className="cf-ghostbtn dash__alertsbtn"
                onClick={() => setAlertsOpen(true)}
              >
                Alerts
              </button>
              <button
                type="button"
                className="cf-add dash__addbtn"
                aria-label="Add expense"
                onClick={openAdd}
              >
                <span aria-hidden="true">+</span>
                <span className="dash__addtext">Add expense</span>
              </button>
            </div>
          </div>

          {/*
            Above the dashboard and outside the tab switch, so the same alerts
            are in view on Daily, Monthly and Yearly alike. They are derived
            straight from the current snapshot, so they follow every edit and
            every month change without anything having to invalidate them.
          */}
          <AlertBanners alerts={alerts} onOpenSettings={() => setAlertsOpen(true)} />

          {tab === 'monthly' ? <MonthlyView {...viewProps} /> : null}
          {tab === 'daily' ? <DailyView {...viewProps} /> : null}
          {tab === 'yearly' ? (
            <YearlyView {...viewProps} year={yearOfMonth(state.yearMonth)} />
          ) : null}
        </div>
      </div>

      {expenseOpen ? (
        <ExpenseModal
          store={store}
          state={state}
          fmt={fmt}
          transaction={editing}
          isRecurring={editing !== null && editing.seriesId !== null}
          onClose={() => {
            setExpenseOpen(false);
            setEditing(null);
          }}
          onManageCategories={() => {
            setExpenseOpen(false);
            setEditing(null);
            setCategoriesOpen(true);
          }}
        />
      ) : null}

      {categoriesOpen ? (
        <CategoryModal
          store={store}
          state={state}
          fmt={fmt}
          onClose={() => setCategoriesOpen(false)}
        />
      ) : null}

      {alertsOpen ? (
        <AlertSettingsModal
          store={store}
          state={state}
          fmt={fmt}
          onClose={() => setAlertsOpen(false)}
        />
      ) : null}

      {state.toast ? <div className="cf-toast cf-anim-in-fast">{state.toast}</div> : null}
    </div>
  );
}
