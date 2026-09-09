import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { DashboardCardSheet } from './DashboardCardSheet';
import { cardCatalog, chosenCards, dashboardHandlers } from '../fixtures';

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
  title: 'Dashboard/DashboardCardSheet',
  component: DashboardCardSheet,
  args: {
    catalog: cardCatalog,
    chosen: chosenCards,
    busy: false,
    ...dashboardHandlers,
  },
  decorators: [(Story) => <PhoneShell><Story /></PhoneShell>],
} satisfies Meta<typeof DashboardCardSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cash-flow group, with Budget left already on the dashboard. */
export const Default: Story = {};

/** Nothing picked yet — every card offers Add. */
export const Empty: Story = { args: { chosen: [] } };
