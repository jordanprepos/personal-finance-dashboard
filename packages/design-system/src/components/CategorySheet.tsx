import { useState, type JSX } from 'react';
import {
  CATEGORY_TYPES,
  emptyCategoryForm,
  evaluateCategoryForm,
  formatAmountInput,
  formatMoney,
} from '@expense-tracker/shared';

import { DEFAULT_CATEGORY_COUNT, DefaultCategoriesButton } from './DefaultCategoriesButton.js';
import type { CategoryManagerProps } from '../types.js';
import { useDismiss } from '../useDismiss.js';

export type CategorySheetProps = CategoryManagerProps;

/**
 * The mobile categories sheet — the same capabilities as the desktop dialog
 * minus the inline allocation field: an allocation is set once when the
 * category is created, and each row carries a 38px two-tap delete instead.
 */
export function CategorySheet({
  categories,
  entryCounts,
  allocations,
  busy,
  fmt,
  onAddCategory,
  onDeleteCategory,
  onAddDefaultCategories,
  onClose,
}: CategorySheetProps): JSX.Element {
  const { dismiss } = useDismiss({ onClose });
  const [values, setValues] = useState(emptyCategoryForm);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const result = evaluateCategoryForm(values, categories);

  return (
    <div className="cf-scrim" onClick={dismiss} role="presentation">
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
        {categories.length === 0 ? (
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
              Start with {DEFAULT_CATEGORY_COUNT} suggested categories, each with a starting monthly
              allocation you can change.
            </div>
            <DefaultCategoriesButton busy={busy} onAdd={onAddDefaultCategories} />
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
          style={{ padding: 14, flex: 'none' }}
          disabled={!result.valid || busy}
          onClick={() => {
            onAddCategory(result.name, values.type, result.allocation);
            setValues(emptyCategoryForm());
          }}
        >
          {result.duplicate ? 'Already exists' : 'Add category'}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 'none' }}>
          {categories.map((c) => {
            const count = entryCounts[c.id] ?? 0;
            const allocation = allocations[c.id] ?? 0;
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
                    // Red at rest, solid red once armed — the confirm step is
                    // the destructive one, so it must not be the quieter of
                    // the two. Ink made it exactly that.
                    border: '1px solid var(--cf-danger-strong)',
                    background: pending ? 'var(--cf-danger-strong)' : 'transparent',
                    color: pending ? 'var(--cf-surface)' : 'var(--cf-danger-strong)',
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
                    onDeleteCategory(c);
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
