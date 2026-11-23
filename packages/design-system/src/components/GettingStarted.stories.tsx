import type { Meta, StoryObj } from '@storybook/react-vite';

import { GettingStarted } from './GettingStarted';

const meta = {
  title: 'Onboarding/GettingStarted',
  component: GettingStarted,
  args: {
    progress: { categories: false, income: false, expense: false },
    busy: false,
    onAddDefaultCategories: () => {},
    onManageCategories: () => {},
    onAddIncome: () => {},
    onAddExpense: () => {},
    cycleStartDay: 1,
    cycleRangeLabel: '',
    onSetCycleStartDay: () => {},
  },
  decorators: [
    (Story) => <div style={{ background: 'var(--cf-page)', padding: 20, maxWidth: 960 }}><Story /></div>,
  ],
} satisfies Meta<typeof GettingStarted>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A brand-new account: nothing set up yet. */
export const Fresh: Story = {};

/** Categories in, income and a first expense still to go. */
export const CategoriesDone: Story = {
  args: { progress: { categories: true, income: false, expense: false } },
};

/** Only the first expense left. */
export const AlmostThere: Story = {
  args: { progress: { categories: true, income: true, expense: false } },
};

/** Disabled while the default categories are being written. */
export const Busy: Story = { args: { busy: true } };

/** The phone surface: the actions drop under each step and grow to 44px. */
export const OnPhone: Story = {
  decorators: [
    (Story) => (
      <div className="cf-phone" style={{ padding: 20 }}>
        <Story />
      </div>
    ),
  ],
};
