import { useState, type JSX } from 'react';
import {
  CATEGORY_TYPES,
  emptyCategoryForm,
  evaluateCategoryForm,
  formatAmountInput,
  formatMoney,
  type ExpenseState,
  type ExpenseStore,
  type MoneyFormat,
} from '@expense-tracker/shared';

interface Props {
  store: ExpenseStore;
  state: ExpenseState;
  fmt: MoneyFormat;
  onClose: () => void;
}

export function CategorySheet({ store, state, fmt, onClose }: Props): JSX.Element {
  const [values, setValues] = useState(emptyCategoryForm);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const result = evaluateCategoryForm(values, state.categories);

  return (
    <div className="cf-scrim" onClick={onClose} role="presentation">
      <div
        className="cf-sheet cf-anim-in-fast"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="cf-sheet__grab" />

        <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
          <span style={{ fontWeight: 700, fontSize: 19, letterSpacing: '-.02em' }}>Categories</span>
          <span className="cf-spacer" />
          <button type="button" className="cf-back" onClick={onClose}>
            Done
          </button>
        </div>

        {/* Offered only while the account is empty — once there are categories
            this would just be a second, redundant way to bulk-add. */}
        {state.categories.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 8,
              flex: 'none',
              padding: 12,
              border: '1px solid var(--cf-border)',
              borderRadius: 'var(--cf-r-tile)',
            }}
          >
            <div style={{ fontSize: 12.5, color: 'var(--cf-slate)' }}>
              Start with the 11 categories from your spreadsheet, with their monthly allocations.
            </div>
            <button
              type="button"
              className="cf-ghostbtn"
              style={{ borderColor: 'var(--cf-blue)', color: 'var(--cf-blue)' }}
              disabled={state.busy}
              onClick={() => void store.addDefaultCategories()}
            >
              Use my default categories
            </button>
          </div>
        ) : null}

        <div style={{ flex: 'none' }}>
          <div className="cf-fieldlabel">New category</div>
          <input
            className="cf-input--phone"
            placeholder="Category name"
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
          />
        </div>

        <div style={{ flex: 'none' }}>
          <div className="cf-fieldlabel">Allocation this month</div>
          <input
            className="cf-input--phone tnum"
            placeholder="Rp0"
            inputMode="numeric"
            value={formatAmountInput(values.allocationText, fmt)}
            onChange={(e) =>
              setValues({ ...values, allocationText: e.target.value.replace(/[^0-9]/g, '') })
            }
          />
        </div>

        <div className="cf-opts" style={{ flex: 'none' }}>
          {CATEGORY_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`cf-opt ${values.type === t.value ? 'cf-opt--on' : 'cf-opt--off'}`}
              style={{ minHeight: 44 }}
              onClick={() => setValues({ ...values, type: t.value })}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="cf-cta cf-cta--primary"
          style={{ padding: 14, flex: 'none', opacity: result.valid ? 1 : 0.45 }}
          disabled={!result.valid || state.busy}
          onClick={() => {
            void store.addCategory(result.name, values.type, result.allocation);
            setValues(emptyCategoryForm());
          }}
        >
          {result.duplicate ? 'Already exists' : 'Add category'}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 'none' }}>
          {state.categories.map((c) => {
            const count = state.yearTransactions.filter((t) => t.categoryId === c.id).length;
            const allocation = state.budget?.categoryBudgets[c.id] ?? 0;
            const pending = pendingDelete === c.id;
            return (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  border: '1px solid var(--cf-border)',
                  borderRadius: 'var(--cf-r-tile)',
                }}
              >
                <span
                  style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flex: 'none' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--cf-muted)' }}>
                    {allocation > 0 ? `${formatMoney(allocation, fmt)} · ` : 'no allocation · '}
                    {count} {count === 1 ? 'entry' : 'entries'}
                  </div>
                </div>
                <button
                  type="button"
                  style={{
                    flex: 'none',
                    minHeight: 38,
                    padding: '0 12px',
                    borderRadius: 'var(--cf-r-pill)',
                    border: `1px solid ${pending ? 'var(--cf-ink)' : 'var(--cf-border-strong)'}`,
                    background: pending ? 'var(--cf-ink)' : 'transparent',
                    color: pending ? '#fff' : 'var(--cf-slate)',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    fontSize: 12,
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
                  {pending ? (count ? `Delete + ${count}` : 'Confirm') : 'Delete'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
