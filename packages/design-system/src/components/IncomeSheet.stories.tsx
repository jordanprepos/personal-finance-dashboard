import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IDR } from '@expense-tracker/shared';

import { IncomeSheet } from './IncomeSheet';
import { incomeSource, yearMonth } from '../fixtures';

function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="cf-phone" style={{ position: 'relative' }}>
      <div style={{ flex: 1, background: 'var(--cf-page)' }} />
      {children}
    </div>
  );
}

const meta = {
  title: 'Income/IncomeSheet',
  component: IncomeSheet,
  args: {
    fmt: IDR, yearMonth, editing: null, canRemove: true,
    onSave: () => {}, onRemove: () => {}, onClose: () => {},
  },
  decorators: [(Story) => <PhoneShell><Story /></PhoneShell>],
} satisfies Meta<typeof IncomeSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Add: Story = {};

/** Editing offers Remove — inside the sheet, not a thumb-width from Pause. */
export const Edit: Story = { args: { editing: incomeSource } };

/** The month's last source: a month always keeps one, so Remove is withheld. */
export const LastSource: Story = { args: { editing: incomeSource, canRemove: false } };
