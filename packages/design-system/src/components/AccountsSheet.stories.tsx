import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IDR } from '@expense-tracker/shared';

import { AccountsSheet } from './AccountsSheet';
import { accountHandlers, balances, today } from '../fixtures';

/** `.cf-scrim` is positioned absolutely — without this shell it has nothing to fill. */
function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="cf-phone" style={{ position: 'relative' }}>
      <div style={{ flex: 1, background: 'var(--cf-page)' }} />
      {children}
    </div>
  );
}

const meta = {
  title: 'Accounts/AccountsSheet',
  component: AccountsSheet,
  args: { balances, today, busy: false, fmt: IDR, ...accountHandlers },
  decorators: [(Story) => <PhoneShell><Story /></PhoneShell>],
} satisfies Meta<typeof AccountsSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The same four accounts, in a phone's single column. */
export const Default: Story = {};

/** A fresh account. */
export const Empty: Story = { args: { balances: [] } };
