import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SpendAlert } from '@expense-tracker/shared';

import { DesktopAlertBanners } from './DesktopAlertBanners';

/**
 * Copy here mirrors exactly what `evaluateAlerts` emits — the breach title is
 * fixed, the warning headline carries the percentage actually used, and both
 * bodies are built from `formatMoney` in the profile's locale.
 */
const breach: SpendAlert = {
  id: 'month',
  level: 'breach',
  scope: 'month',
  categoryName: null,
  title: 'Over the monthly limit',
  body: 'Rp 450.000 above the Rp 8.000.000 cap for August.',
  spent: 8_450_000,
  limit: 8_000_000,
  used: 1.056,
};

const warning: SpendAlert = {
  id: 'category:Groceries',
  level: 'warning',
  scope: 'category',
  categoryName: 'Groceries',
  title: 'Groceries is close to its limit',
  body: 'Rp 240.000 left before the Rp 1.500.000 cap.',
  spent: 1_260_000,
  limit: 1_500_000,
  used: 0.84,
};

/** The desktop dashboard's page surface, so the banners sit on real ground. */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: 'var(--cf-page)', padding: '20px 24px', width: 720 }}>{children}</div>
  );
}

const meta = {
  title: 'Alerts/DesktopAlertBanners',
  component: DesktopAlertBanners,
  decorators: [
    (Story) => (
      <Surface>
        <Story />
      </Surface>
    ),
  ],
} satisfies Meta<typeof DesktopAlertBanners>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Breaches sort first, so a full stack leads with the dark ink surface. */
export const BreachAndWarning: Story = {
  args: { alerts: [breach, warning], onOpenSettings: () => {} },
};

/** Over the cap — the dark ink surface. */
export const Breach: Story = {
  args: { alerts: [breach], onOpenSettings: () => {} },
};

/** At or past `warnPct` of the cap — the pale accent. */
export const Warning: Story = {
  args: { alerts: [warning], onOpenSettings: () => {} },
};
