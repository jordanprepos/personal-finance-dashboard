import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IDR } from '@expense-tracker/shared';

import { CategorySheet } from './CategorySheet';
import { allocations, categories, categoryHandlers, entryCounts, yearMonth } from '../fixtures';

function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="cf-phone" style={{ position: 'relative' }}>
      <div style={{ flex: 1, background: 'var(--cf-page)' }} />
      {children}
    </div>
  );
}

const meta = {
  title: 'Categories/CategorySheet',
  component: CategorySheet,
  args: { categories, entryCounts, allocations, yearMonth, busy: false, fmt: IDR, ...categoryHandlers },
  decorators: [(Story) => <PhoneShell><Story /></PhoneShell>],
} satisfies Meta<typeof CategorySheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = { args: { categories: [], entryCounts: {}, allocations: {} } };
