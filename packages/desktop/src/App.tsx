import { useMemo, useState, type JSX } from 'react';
import {
  monthLabel,
  shiftMonth,
  yearOfMonth,
  type MoneyFormat,
  type ExpenseStore,
  type Transaction,
} from '@expense-tracker/shared';

import type { Tab } from './appTypes';
import { useStore } from './useStore';
import { MonthlyView } from './views/MonthlyView';
import { DailyView } from './views/DailyView';
import { YearlyView } from './views/YearlyView';
import { ExpenseModal } from './components/ExpenseModal';
import { CategoryModal } from './components/CategoryModal';

export function App({ store }: { store: ExpenseStore }): JSX.Element {
  const state = useStore(store);
  const [tab, setTab] = useState<Tab>('monthly');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

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
      </div>
    );
  }

  const viewProps = { store, state, fmt, onEdit: openEdit, onAdd: openAdd };

  return (
    <div className="dash">
      <header className="dash__header">
        <span className="dash__brand">Alokasi Keuangan</span>
        <span style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
          {state.mode === 'firestore' ? 'live · Firestore' : 'demo data'}
        </span>
        {state.warning ? <span className="cf-banner">{state.warning}</span> : null}
      </header>

      <div className="dash__panel cf-panel">
        <div className="dash__body">
          <div className="dash__toolbar">
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

            <span className="cf-spacer" />

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

            <button type="button" className="cf-ghostbtn" onClick={() => setCategoriesOpen(true)}>
              Categories
            </button>
            <button
              type="button"
              className="cf-add"
              style={{ height: 36, fontSize: 13 }}
              onClick={openAdd}
            >
              + Add expense
            </button>
          </div>

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

      {state.toast ? <div className="cf-toast cf-anim-in-fast">{state.toast}</div> : null}
    </div>
  );
}
