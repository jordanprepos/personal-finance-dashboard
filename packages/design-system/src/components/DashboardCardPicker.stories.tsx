import type { Meta, StoryObj } from '@storybook/react-vite';

import { DashboardCardPicker } from './DashboardCardPicker';
import { cardCatalog, chosenCards, dashboardHandlers } from '../fixtures';

const meta = {
  title: 'Dashboard/DashboardCardPicker',
  component: DashboardCardPicker,
  args: {
    catalog: cardCatalog,
    chosen: chosenCards,
    busy: false,
    ...dashboardHandlers,
  },
} satisfies Meta<typeof DashboardCardPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cash-flow group, with Budget left already on the dashboard. */
export const Default: Story = {};

/** Nothing picked yet — every card offers Add. */
export const Empty: Story = { args: { chosen: [] } };

/** A write in flight: every add and remove is disabled until it lands. */
export const Busy: Story = { args: { busy: true } };
