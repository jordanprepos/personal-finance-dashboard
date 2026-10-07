import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  evaluateAlerts,
  accountBalancesOf,
  buildDashboardCard,
  categoryLimitRows,
  dashboardCardContext,
  DASHBOARD_CARDS,
  entryCountsByCategory,
  monthLabel,
  periodRangeLabel,
  setupProgress,
  sumAmounts,
  transactionsToDate,
  shiftMonth,
  yearOfMonth,
  type AuthController,
  type AuthState,
  type EnvRecord,
  type DashboardCardId,
  type MoneyFormat,
  type ExpenseStore,
  type Transaction,
} from '@expense-tracker/shared';

import { SPEND_TABS, TAB_LABELS, type Tab } from './appTypes';
import { useAuth, useStore } from './useStore';
import { LoginView } from './views/LoginView';
import { HomeView } from './views/HomeView';
import { MonthlyView } from './views/MonthlyView';
import { DailyView } from './views/DailyView';
import { YearlyView } from './views/YearlyView';
import { IncomeView } from './views/IncomeView';
import { ExpenseModal } from '@expense-tracker/design-system';

import { DesktopAlertBanners as AlertBanners } from '@expense-tracker/design-system';
import {
  AccountsModal,
  AlertSettingsModal,
  CategoryModal,
  DashboardCardPicker,
  GettingStarted,
  Toast,
} from '@expense-tracker/design-system';

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
  // Home first, on both apps: it is the view you assemble yourself, and it is
  // where a fresh account's getting-started panel sits above the cards. This
  // opened on Monthly while the phone opened on its ledger.
  const [tab, setTab] = useState<Tab>('home');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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
    today: state.today,
    // Money is formatted in the profile's locale; the month *name* is not.
    // `monthLabel` in the month nav above is en-US, so a banner saying
    // "for Agustus" under a header saying "August 2026" would read as a bug.
    fmt,
  });

  const setup = setupProgress({
    categories: state.categories,
    hasTransactions: state.hasTransactions,
    budget: state.budget,
    yearMonth: state.yearMonth,
    today: state.today,
    cycleStartDay: state.profile.cycleStartDay,
  });

  const viewProps = {
    store,
    state,
    fmt,
    onEdit: openEdit,
    onAdd: openAdd,
    onOpenIncome: () => setTab('income'),
    setupShowing: setup.show && tab !== 'income',
  };

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
              <span className="dash__monthlabel">
                {monthLabel(state.yearMonth)}
                {/* The window the label names, when it is not simply the
                    calendar month — a cycle's id says which month it *ends*
                    in, which on its own would not say where it starts. */}
                {periodRangeLabel(state) ? (
                  <span className="dash__monthrange">{periodRangeLabel(state)}</span>
                ) : null}
              </span>
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
                {SPEND_TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`cf-cat ${tab === t ? 'cf-cat--active' : 'cf-cat--idle'}`}
                    style={{ border: 0 }}
                    onClick={() => setTab(t)}
                  >
                    {TAB_LABELS[t]}
                  </button>
                ))}
              </div>

              {/*
                Income is a page, not a modal — it is the one of these three
                that has a list to work through rather than a form to fill in.
                So it reads as pressed while you are on it, and the tab strip
                beside it is the way back.
              */}
              <button
                type="button"
                className={`cf-ghostbtn dash__incomebtn${tab === 'income' ? ' dash__incomebtn--on' : ''}`}
                aria-pressed={tab === 'income'}
                onClick={() => setTab(tab === 'income' ? 'monthly' : 'income')}
              >
                Income
              </button>
              <button
                type="button"
                className="cf-ghostbtn dash__catsbtn"
                onClick={() => setCategoriesOpen(true)}
              >
                Categories
              </button>
              <button
                type="button"
                className="cf-ghostbtn dash__catsbtn"
                onClick={() => setAccountsOpen(true)}
              >
                Accounts
              </button>
              <button
                type="button"
                className="cf-ghostbtn dash__alertsbtn"
                onClick={() => setAlertsOpen(true)}
              >
                Settings
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
            are in view on Entries, Monthly and Yearly alike. They are derived
            straight from the current snapshot, so they follow every edit and
            every month change without anything having to invalidate them.
          */}
          <AlertBanners alerts={alerts} onOpenSettings={() => setAlertsOpen(true)} />

          {/*
            What a fresh account sees above whichever spend tab it opened on,
            so no tab is a page of blank envelopes with no next step. Not on
            the Income page: step two is what sends you there.
          */}
          {setup.show && tab !== 'income' ? (
            <GettingStarted
              progress={setup}
              busy={state.busy}
              onAddDefaultCategories={() => void store.addDefaultCategories()}
              onManageCategories={() => setCategoriesOpen(true)}
              onAddIncome={() => setTab('income')}
              onAddExpense={openAdd}
            />
          ) : null}

          {tab === 'home' ? (
            <HomeView {...viewProps} onCustomize={() => setPickerOpen(true)} />
          ) : null}
          {tab === 'monthly' ? <MonthlyView {...viewProps} /> : null}
          {tab === 'daily' ? <DailyView {...viewProps} /> : null}
          {tab === 'yearly' ? (
            <YearlyView {...viewProps} year={yearOfMonth(state.yearMonth)} />
          ) : null}
          {tab === 'income' ? <IncomeView {...viewProps} /> : null}
        </div>
      </div>

      {expenseOpen ? (
        <ExpenseModal
          yearMonth={state.yearMonth}
          today={state.today}
          cycleStartDay={state.profile.cycleStartDay}
          categories={state.categories}
          accounts={state.accounts}
          busy={state.busy}
          fmt={fmt}
          onSave={(draft, entry) => {
            if (entry) void store.updateExpense(entry.id, draft);
            else void store.addExpense(draft);
          }}
          onDelete={(entry) => void store.deleteExpense(entry)}
          onDeleteSeries={(entry) => void store.deleteExpenseSeries(entry)}
          onExtendSeries={(entry) => void store.extendExpenseSeries(entry)}
          onAddDefaultCategories={() => void store.addDefaultCategories()}
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
          onManageAccounts={() => {
            setExpenseOpen(false);
            setEditing(null);
            setAccountsOpen(true);
          }}
        />
      ) : null}

      {categoriesOpen ? (
        <CategoryModal
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
          onSetAllocation={(categoryId, amount) => void store.setCategoryBudget(categoryId, amount)}
          onAddDefaultCategories={() => void store.addDefaultCategories()}
          onCarryOver={() => void store.carryOverBudget()}
          onClose={() => setCategoriesOpen(false)}
        />
      ) : null}

      {alertsOpen ? (
        <AlertSettingsModal
          alerts={state.profile.alerts}
          cycleStartDay={state.profile.cycleStartDay}
          cycleRangeLabel={periodRangeLabel(state)}
          rows={categoryLimitRows(
            state.profile.alerts,
            state.monthTransactions,
            state.categories,
            state.today,
          )}
          // To today, as the banner measures it — the whole window would count
          // bills scheduled later in the period against the cap.
          spentToDate={sumAmounts(transactionsToDate(state.monthTransactions, state.today))}
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

      {accountsOpen ? (
        <AccountsModal
          /* Balances arrive projected from the snapshot — reconciled figure
             less what has been tagged since. Nothing is computed here. */
          balances={accountBalancesOf(state)}
          today={state.today}
          busy={state.busy}
          fmt={fmt}
          onAdd={(input) => void store.addAccount(input)}
          onUpdate={(id, patch) => void store.updateAccount(id, patch)}
          onReconcile={(id, balance, asOf) => void store.reconcileAccount(id, balance, asOf)}
          onDelete={(account) => void store.deleteAccount(account)}
          onClose={() => setAccountsOpen(false)}
        />
      ) : null}

      {pickerOpen ? (
        <DashboardCardPicker
          /* Every card in the registry, built against the period in view — the
             previews are the real numbers, not sample data. */
          catalog={DASHBOARD_CARDS.map((spec) =>
            buildDashboardCard(spec.id, dashboardCardContext(state, fmt)),
          )}
          chosen={state.profile.dashboardCards}
          busy={state.busy}
          onAdd={(id: DashboardCardId) => void store.addDashboardCard(id)}
          onRemove={(id: DashboardCardId) => void store.removeDashboardCard(id)}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      {state.toast ? (
        <Toast text={state.toast} undoable={state.undoable} onUndo={() => void store.undo()} />
      ) : null}
    </div>
  );
}
