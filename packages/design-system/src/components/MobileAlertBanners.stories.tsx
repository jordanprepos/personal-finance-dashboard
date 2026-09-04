import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SpendAlert } from '@expense-tracker/shared';

import { MobileAlertBanners } from './MobileAlertBanners';

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

/**
 * The phone shell's content width (360px frame less its 14px gutters), so the
 * banners wrap exactly as they do in the webview.
 */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: 'var(--cf-page)', padding: 14, width: 360 }}>{children}</div>
  );
}

const meta = {
  title: 'Alerts/MobileAlertBanners',
  component: MobileAlertBanners,
  decorators: [
    (Story) => (
      <Surface>
        <Story />
      </Surface>
    ),
  ],
} satisfies Meta<typeof MobileAlertBanners>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The whole banner is the tap target here — it clears 44px on its own. */
export const BreachAndWarning: Story = {
  args: { alerts: [breach, warning], onOpenSettings: () => {} },
};

export const Breach: Story = {
  args: { alerts: [breach], onOpenSettings: () => {} },
};

export const Warning: Story = {
  args: { alerts: [warning], onOpenSettings: () => {} },
};
