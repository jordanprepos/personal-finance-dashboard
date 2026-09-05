import type { Meta, StoryObj } from '@storybook/react-vite';
import { IDR } from '@expense-tracker/shared';

import { IncomeModal } from './IncomeModal';
import { incomeSource, yearMonth } from '../fixtures';

const meta = {
  title: 'Income/IncomeModal',
  component: IncomeModal,
  args: { fmt: IDR, yearMonth, editing: null, onSave: () => {}, onClose: () => {} },
} satisfies Meta<typeof IncomeModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Adding a source — the header says which month it lands in. */
export const Add: Story = {};

/** Editing an existing source. Pausing is a row action, so it is not a field here. */
export const Edit: Story = { args: { editing: incomeSource } };

/** Quarterly explains itself: a third of the payment counts toward each month. */
export const Quarterly: Story = {
  args: { editing: { ...incomeSource, cadence: 'quarterly', amount: 18_000_000 } },
};
