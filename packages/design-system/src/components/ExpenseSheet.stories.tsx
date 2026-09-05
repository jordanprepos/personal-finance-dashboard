import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IDR } from '@expense-tracker/shared';

import { ExpenseSheet } from './ExpenseSheet';
import { categories, noopHandlers, recurringTransaction, today, transaction, yearMonth } from '../fixtures';

/**
 * The phone shell. `.cf-scrim` is `position: absolute; inset: 0`, so the sheet
 * only has a box to fill inside `.cf-phone` — which is also the only place it
 * ever appears in the app.
 */
function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="cf-phone" style={{ position: 'relative' }}>
      <div style={{ flex: 1, background: 'var(--cf-page)' }} />
      {children}
    </div>
  );
}

const meta = {
  title: 'Expense/ExpenseSheet',
  component: ExpenseSheet,
  decorators: [(Story) => <PhoneShell><Story /></PhoneShell>],
  args: { yearMonth, today, categories, busy: false, fmt: IDR, transaction: null, isRecurring: false, ...noopHandlers },
} satisfies Meta<typeof ExpenseSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Add: Story = {};
export const Edit: Story = { args: { transaction, isRecurring: false } };
export const EditRecurring: Story = { args: { transaction: recurringTransaction, isRecurring: true } };
export const NoCategories: Story = { args: { categories: [] } };

/**
 * A valid form mid-save: the button is disabled, so it must read as disabled.
 * This is the case an inline `opacity: result.valid ? 1 : 0.45` used to break —
 * inline styles beat `.cf-cta:disabled`, so a valid-but-busy CTA stayed fully
 * lit while the write was in flight.
 */
export const Saving: Story = { args: { transaction, busy: true } };
