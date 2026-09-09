import type { Meta, StoryObj } from '@storybook/react-vite';
import { IDR } from '@expense-tracker/shared';

import { AccountsModal } from './AccountsModal';
import { accountHandlers, balances, today } from '../fixtures';

const meta = {
  title: 'Accounts/AccountsModal',
  component: AccountsModal,
  args: { balances, today, busy: false, fmt: IDR, ...accountHandlers },
} satisfies Meta<typeof AccountsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Four accounts: a checking account projecting down from a recent
 * reconciliation, a savings account whose reconciliation is too old to project
 * from, a card with a limit, and a loan whose balance is a debt.
 */
export const Default: Story = {};

/** A fresh account — the list explains itself rather than sitting empty. */
export const Empty: Story = { args: { balances: [] } };

/** A write in flight: every action is disabled until it lands. */
export const Busy: Story = { args: { busy: true } };
