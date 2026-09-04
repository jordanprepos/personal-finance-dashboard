import type { Meta, StoryObj } from '@storybook/react-vite';
import { IDR } from '@expense-tracker/shared';

import { ExpenseModal } from './ExpenseModal';
import { categories, noopHandlers, recurringTransaction, today, transaction, yearMonth } from '../fixtures';

const meta = {
  title: 'Expense/ExpenseModal',
  component: ExpenseModal,
  args: { yearMonth, today, categories, busy: false, fmt: IDR, transaction: null, isRecurring: false, ...noopHandlers },
} satisfies Meta<typeof ExpenseModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Adding: Save stays dimmed until the form is valid. */
export const Add: Story = {};

/** Editing a one-off entry — adds the single delete action. */
export const Edit: Story = { args: { transaction, isRecurring: false } };

/** Editing a series member — adds the second, dark "this + future months" action. */
export const EditRecurring: Story = { args: { transaction: recurringTransaction, isRecurring: true } };

/** A fresh account: the category row would be a dead end, so it offers a way out. */
export const NoCategories: Story = { args: { categories: [] } };

/**
 * A valid form mid-save: the button is disabled, so it must read as disabled.
 * This is the case an inline `opacity: result.valid ? 1 : 0.45` used to break —
 * inline styles beat `.cf-cta:disabled`, so a valid-but-busy CTA stayed fully
 * lit while the write was in flight.
 */
export const Saving: Story = { args: { transaction, busy: true } };
