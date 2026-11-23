import { useState, type JSX } from 'react';
import {
  CATEGORY_TYPES,
  emptyCategoryForm,
  evaluateCategoryForm,
  formatAmountInput,
  monthLabel,
  unsetAllocationIds,
  parseAmountInput,
  type MoneyFormat,
} from '@expense-tracker/shared';

import { CarryOverButton } from './CarryOverButton.js';
import { DEFAULT_CATEGORY_COUNT, DefaultCategoriesButton } from './DefaultCategoriesButton.js';
import type { CategoryManagerProps } from '../types.js';
import { useDismiss } from '../useDismiss.js';
import { amountFieldText, useCommittedInput } from '../useCommittedInput.js';

export type CategorySheetProps = CategoryManagerProps;

/**
 * The mobile categories sheet — the same capabilities as the desktop dialog:
 * bulk-seed while empty, an add form, and a row per category with this
 * month's allocation and a 38px two-tap delete.
 *
 * The allocation sits on its own line under the name rather than beside it as
 * on desktop: at 360px a name, a money field and Delete in one row would leave
 * the name little room. It used to be absent altogether — set once at create — and
 * since allocations are per month, every month after a category's first read
 * "no allocation" with no way on the phone to change it.
 */
export function CategorySheet({
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
  onCarryOver,
  onClose,
}: CategorySheetProps): JSX.Element {
  const { dismiss } = useDismiss({ onClose });
  const [values, setValues] = useState(emptyCategoryForm);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const unset = unsetAllocationIds(categories, allocations);
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
              Start with {DEFAULT_CATEGORY_COUNT} suggested categories. If this month has income,
              it is split across them as a starting allocation you can change.
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

        {/* Allocations are per month, so every new month opens with gaps.
            Copying is the way back to last month's envelopes without
            re-typing each one. Offered while any category has no allocation
            *set* — the same test the carry fills by, so a month whose gaps
            were all cleared to 0 on purpose is not offered a copy that would
            then report nothing to do. */}
        {unset.length > 0 ? (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 'none' }}
          >
            <span style={{ fontSize: 12.5, color: 'var(--cf-slate)' }}>
              {unset.length === categories.length
                ? `No allocations for ${monthLabel(yearMonth)} yet.`
                : `${unset.length} ${unset.length === 1 ? 'category has' : 'categories have'} no allocation for ${monthLabel(yearMonth)} yet.`}
            </span>
            <CarryOverButton busy={busy} onCarryOver={onCarryOver} style={{ minHeight: 44 }} />
          </div>
        ) : null}

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
                  flexDirection: 'column',
                  gap: 8,
                  padding: '9px 12px',
                  border: '1px solid var(--cf-border)',
                  borderRadius: 'var(--cf-r-tile)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flex: 'none' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--cf-muted)' }}>
                      {count} {count === 1 ? 'entry' : 'entries'} this year
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
                <AllocationField
                  name={c.name}
                  allocation={allocation}
                  monthName={monthLabel(yearMonth)}
                  fmt={fmt}
                  onCommit={(amount) => onSetAllocation(c.id, amount)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * One category's allocation for the month in view. Commits on blur or Enter,
 * like the alert caps, so a half-typed figure is never written; an emptied
 * field commits 0, which clears it.
 */
function AllocationField({
  name,
  allocation,
  monthName,
  fmt,
  onCommit,
}: {
  name: string;
  allocation: number;
  monthName: string;
  fmt: MoneyFormat;
  onCommit: (amount: number) => void;
}): JSX.Element {
  const field = useCommittedInput({
    value: allocation,
    format: amountFieldText,
    parse: parseAmountInput,
    onCommit,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--cf-muted)' }}>
        Allocation · {monthName}
      </span>
      <input
        className="cf-input--phone tnum"
        style={{ flex: 'none', width: 148, textAlign: 'right' }}
        inputMode="numeric"
        placeholder="no allocation"
        aria-label={`${name} allocation for ${monthName}`}
        value={formatAmountInput(field.text, fmt)}
        onChange={(e) => field.setText(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={field.commit}
        onKeyDown={field.onKeyDown}
      />
    </div>
  );
}
