import type { Meta, StoryObj } from '@storybook/react-vite';

import { DefaultCategoriesButton, DEFAULT_CATEGORY_COUNT } from './DefaultCategoriesButton';

const meta = {
  title: 'Categories/DefaultCategoriesButton',
  component: DefaultCategoriesButton,
  args: { busy: false, onAdd: () => {} },
  decorators: [
    (Story) => <div style={{ background: 'var(--cf-page)', padding: 20 }}><Story /></div>,
  ],
} satisfies Meta<typeof DefaultCategoriesButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The count comes from the template, so copy can't claim a wrong number. */
export const WithCount: Story = {
  args: { label: `Use my ${DEFAULT_CATEGORY_COUNT} default categories` },
};

/** Disabled while a write is in flight. */
export const Busy: Story = { args: { busy: true } };
