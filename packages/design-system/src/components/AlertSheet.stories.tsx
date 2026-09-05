import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IDR } from '@expense-tracker/shared';

import { AlertSheet } from './AlertSheet';
import { alertHandlers, alertSettings, categories, cycleRangeLabel, cycleStartDay, limitRows, monthSpend } from '../fixtures';

function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="cf-phone" style={{ position: 'relative' }}>
      <div style={{ flex: 1, background: 'var(--cf-page)' }} />
      {children}
    </div>
  );
}

const meta = {
  title: 'Alerts/AlertSheet',
  component: AlertSheet,
  args: {
    alerts: alertSettings,
    cycleStartDay,
    cycleRangeLabel,
    rows: limitRows,
    monthSpend,
    categories,
    fmt: IDR,
    ...alertHandlers,
  },
  decorators: [(Story) => <PhoneShell><Story /></PhoneShell>],
} satisfies Meta<typeof AlertSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Enabled: Story = {};
export const Disabled: Story = { args: { alerts: { ...alertSettings, enabled: false } } };
