import type { Meta, StoryObj } from '@storybook/react-vite';

import { DashboardCard } from './DashboardCard';
import { barsCard, donutCard, rowsCard, statCard } from '../fixtures';

const meta = {
  title: 'Dashboard/DashboardCard',
  component: DashboardCard,
  args: { card: statCard },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420, padding: 16, background: 'var(--cf-page)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DashboardCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A headline figure with a progress track — Budget left. */
export const Stat: Story = {};

/** A ranked list with bars and a footer — Top categories. */
export const Rows: Story = { args: { card: rowsCard } };

/** An arc plus a legend — Spending mix. */
export const Donut: Story = { args: { card: donutCard } };

/** Twelve periods and the income reference line. Wider, so it gets more room. */
export const Bars: Story = {
  args: { card: barsCard },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720, padding: 16, background: 'var(--cf-page)' }}>
        <Story />
      </div>
    ),
  ],
};

/** As it appears in the picker: the question it answers is shown. */
export const WithQuestion: Story = { args: { card: rowsCard, showQuestion: true } };

/**
 * As it appears on the dashboard: remove, and reorder arrows. A card at the
 * top or bottom of the list simply loses the arrow it cannot use.
 */
export const OnDashboard: Story = {
  args: {
    card: rowsCard,
    onRemove: () => {},
    onMove: () => {},
    canMoveUp: true,
    canMoveDown: true,
  },
};
