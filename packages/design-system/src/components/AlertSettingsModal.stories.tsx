import type { Meta, StoryObj } from '@storybook/react-vite';
import { IDR } from '@expense-tracker/shared';

import { AlertSettingsModal } from './AlertSettingsModal';
import { alertHandlers, alertSettings, categories, limitRows, monthSpend } from '../fixtures';

const meta = {
  title: 'Alerts/AlertSettingsModal',
  component: AlertSettingsModal,
  args: { alerts: alertSettings, rows: limitRows, monthSpend, categories, fmt: IDR, ...alertHandlers },
} satisfies Meta<typeof AlertSettingsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** On, with a breaching cap, a warning cap, and an orphaned one. */
export const Enabled: Story = {};

/** Off — the switch is the first thing, and nothing below it evaluates. */
export const Disabled: Story = { args: { alerts: { ...alertSettings, enabled: false } } };

/** A monthly limit of 0 is unset, not permanently breached. */
export const NoMonthlyLimit: Story = {
  args: { alerts: { ...alertSettings, monthlyLimit: 0 }, rows: [] },
};
