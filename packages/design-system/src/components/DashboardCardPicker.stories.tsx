import type { Meta, StoryObj } from '@storybook/react-vite';

import { DashboardCardPicker } from './DashboardCardPicker';
import {
  cardCatalog,
  cardCatalogNoAccounts,
  cardCatalogNoLimits,
  chosenCards,
  dashboardHandlers,
} from '../fixtures';

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

/**
 * The Credit tab with nothing to draw on.
 *
 * Every card here must say what is missing rather than print `0%` — an unset
 * credit limit is not a limit of nothing, and a zero would read as headroom.
 */
export const NoAccounts: Story = { args: { catalog: cardCatalogNoAccounts, chosen: [] } };

/**
 * The control the empty set cannot give: four accounts exist, but none carries
 * a limit or a monthly payment, so the cards have rows to work with and must
 * *still* refuse to print a percentage.
 */
export const AccountsWithoutLimits: Story = {
  args: { catalog: cardCatalogNoLimits, chosen: [] },
};
