import { useEffect, useState, type JSX } from 'react';
import {
  CATEGORY_TYPES,
  emptyCategoryForm,
  evaluateCategoryForm,
  formatAmountInput,
  formatMoney,
  parseAmountInput,
  type MoneyFormat,
} from '@expense-tracker/shared';

import { DEFAULT_CATEGORY_COUNT, DefaultCategoriesButton } from './DefaultCategoriesButton.js';
import type { CategoryManagerProps } from '../types.js';

export interface CategoryModalProps extends CategoryManagerProps {
  /** Writes this month's allocation for one category. */
  onSetAllocation: (categoryId: string, amount: number) => void;
}

/**
 * The desktop categories dialog: bulk-seed while empty, an add form, and a row
 * per category carrying an inline allocation field and a two-click delete.
 */
export function CategoryModal({
  categories,
  entryCounts,
  allocations,
  yearMonth,
  busy,
  fmt,
  onAddCategory,
  onDeleteCategory,
  onSetAllocation,
  onAddDefaultCategories,
  onClose,
}: CategoryModalProps): JSX.Element {
  const [values, setValues] = useState(emptyCategoryForm);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const result = evaluateCategoryForm(values, categories);

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
            {categories.length} categories
          </span>
        </div>

        {/* Offered only while the account is empty — once there are categories
            this would just be a second, redundant way to bulk-add. */}
        {categories.length === 0 ? (
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
            <DefaultCategoriesButton busy={busy} onAdd={onAddDefaultCategories} style={{ flex: 'none' }} />
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
            style={{ alignSelf: 'flex-start', height: 34 }}
            disabled={!result.valid || busy}
            onClick={() => {
              onAddCategory(result.name, values.type, result.allocation);
              setValues(emptyCategoryForm());
            }}
          >
            {result.duplicate ? 'Already exists' : 'Add category'}
          </button>
          <div style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
            The allocation is stored on{' '}
            <code>budgets/{yearMonth}.categoryBudgets</code>, not on the category.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {categories.map((c) => {
            const count = entryCounts[c.id] ?? 0;
            const allocation = allocations[c.id] ?? 0;
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
                  categoryId={c.id}
                  allocation={allocation}
                  fmt={fmt}
                  onCommit={onSetAllocation}
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
                    // Red at rest, solid red once armed — the confirm step is
                    // the destructive one, so it must not be the quieter of
                    // the two. Ink made it exactly that.
                    border: '1px solid var(--cf-danger-strong)',
                    background: pending ? 'var(--cf-danger-strong)' : 'transparent',
                    color: pending ? 'var(--cf-surface)' : 'var(--cf-danger-strong)',
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
                    onDeleteCategory(c);
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
          {yearMonth.slice(0, 4)}. Click Delete twice to confirm.
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
  categoryId,
  allocation,
  fmt,
  onCommit,
}: {
  categoryId: string;
  allocation: number;
  fmt: MoneyFormat;
  onCommit: (categoryId: string, amount: number) => void;
}): JSX.Element {
  const [text, setText] = useState(allocation > 0 ? String(allocation) : '');
  useEffect(() => setText(allocation > 0 ? String(allocation) : ''), [allocation]);

  const commit = (): void => {
    const next = parseAmountInput(text);
    if (next !== allocation) onCommit(categoryId, next);
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
