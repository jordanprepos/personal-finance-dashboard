import { useEffect, useState, type JSX } from 'react';
import {
  CATEGORY_TYPES,
  emptyCategoryForm,
  evaluateCategoryForm,
  formatAmountInput,
  formatMoney,
  parseAmountInput,
  type Category,
  type ExpenseState,
  type ExpenseStore,
  type MoneyFormat,
} from '@expense-tracker/shared';

import { DEFAULT_CATEGORY_COUNT, DefaultCategoriesButton } from './DefaultCategoriesButton';

interface Props {
  store: ExpenseStore;
  state: ExpenseState;
  fmt: MoneyFormat;
  onClose: () => void;
}

export function CategoryModal({ store, state, fmt, onClose }: Props): JSX.Element {
  const [values, setValues] = useState(emptyCategoryForm);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const result = evaluateCategoryForm(values, state.categories);

  const countIn = (category: Category): number =>
    state.yearTransactions.filter((t) => t.categoryId === category.id).length;

  return (
    <div className="cf-modal-scrim" style={{ zIndex: 55 }} onClick={onClose} role="presentation">
      <div
        className="cf-modal cf-anim-in-fast"
        style={{ width: '100%', maxWidth: 580 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-.025em' }}>Categories</span>
          <span className="cf-spacer" />
          <span style={{ fontSize: 12.5, color: 'var(--cf-muted)' }}>
            {state.categories.length} categories
          </span>
        </div>

        {/* Offered only while the account is empty — once there are categories
            this would just be a second, redundant way to bulk-add. */}
        {state.categories.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              border: '1px solid var(--cf-border)',
              borderRadius: 'var(--cf-r-card)',
            }}
          >
            <div style={{ flex: 1, fontSize: 13, color: 'var(--cf-slate)' }}>
              Start with the {DEFAULT_CATEGORY_COUNT} categories from your spreadsheet, with their
              monthly allocations.
            </div>
            <DefaultCategoriesButton store={store} state={state} style={{ flex: 'none' }} />
          </div>
        ) : null}

        <div
          style={{
            background: 'var(--cf-surface-2)',
            border: '1px solid var(--cf-border)',
            borderRadius: 'var(--cf-r-card)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div className="cf-fieldlabel" style={{ margin: 0 }}>
            Add a category
          </div>
          <div className="dash__catform">
            <input
              className="cf-input--pos"
              style={{ width: '100%' }}
              placeholder="Category name"
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
            />
            <input
              className="cf-input--pos tnum"
              style={{ width: '100%' }}
              placeholder="Allocation (Rp)"
              inputMode="numeric"
              value={formatAmountInput(values.allocationText, fmt)}
              onChange={(e) =>
                setValues({ ...values, allocationText: e.target.value.replace(/[^0-9]/g, '') })
              }
            />
          </div>
          <div className="cf-opts">
            {CATEGORY_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`cf-opt ${values.type === t.value ? 'cf-opt--on' : 'cf-opt--off'}`}
                onClick={() => setValues({ ...values, type: t.value })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cf-add"
            style={{ alignSelf: 'flex-start', height: 34, opacity: result.valid ? 1 : 0.45 }}
            disabled={!result.valid || state.busy}
            onClick={() => {
              void store.addCategory(result.name, values.type, result.allocation);
              setValues(emptyCategoryForm());
            }}
          >
            {result.duplicate ? 'Already exists' : 'Add category'}
          </button>
          <div style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
            The allocation is stored on{' '}
            <code>budgets/{state.yearMonth}.categoryBudgets</code>, not on the category.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.categories.map((c) => {
            const count = countIn(c);
            const allocation = state.budget?.categoryBudgets[c.id] ?? 0;
            const pending = pendingDelete === c.id;
            return (
              <div key={c.id} className="dash__catrow">
                <span
                  className="dash__swatch"
                  style={{ background: c.color, width: 10, height: 10 }}
                />
                <div className="dash__catnamecol">
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 1 }}>
                    {count} {count === 1 ? 'entry' : 'entries'} this year
                  </div>
                </div>
                <AllocationField
                  store={store}
                  categoryId={c.id}
                  allocation={allocation}
                  fmt={fmt}
                />
                <span className="cf-tier" style={{ textTransform: 'capitalize' }}>
                  {c.type}
                </span>
                <button
                  type="button"
                  style={{
                    flex: 'none',
                    height: 32,
                    padding: '0 14px',
                    borderRadius: 'var(--cf-r-pill)',
                    border: `1px solid ${pending ? 'var(--cf-ink)' : 'var(--cf-border-strong)'}`,
                    background: pending ? 'var(--cf-ink)' : 'transparent',
                    color: pending ? '#fff' : 'var(--cf-slate)',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    fontSize: 12.5,
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    if (!pending) {
                      setPendingDelete(c.id);
                      return;
                    }
                    void store.deleteCategory(c);
                    setPendingDelete(null);
                  }}
                >
                  {pending ? 'Delete + all entries' : 'Delete'}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
          Deleting a category removes its entries from every month of every year, not just{' '}
          {state.yearMonth.slice(0, 4)}. Click Delete twice to confirm.
        </div>

        <button type="button" className="cf-cta cf-cta--outline" style={{ padding: 13 }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

/** Writes budgets/{yearMonth}.categoryBudgets[categoryId] — allocations are per month. */
function AllocationField({
  store,
  categoryId,
  allocation,
  fmt,
}: {
  store: ExpenseStore;
  categoryId: string;
  allocation: number;
  fmt: MoneyFormat;
}): JSX.Element {
  const [text, setText] = useState(allocation > 0 ? String(allocation) : '');
  useEffect(() => setText(allocation > 0 ? String(allocation) : ''), [allocation]);

  const commit = (): void => {
    const next = parseAmountInput(text);
    if (next !== allocation) void store.setCategoryBudget(categoryId, next);
  };

  return (
    <input
      className="cf-input--pos tnum dash__allocinput"
      inputMode="numeric"
      placeholder="no allocation"
      aria-label="Monthly allocation"
      value={formatAmountInput(text, fmt)}
      onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
