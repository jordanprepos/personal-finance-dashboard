import type { Meta, StoryObj } from '@storybook/react-vite';
import { IDR } from '@expense-tracker/shared';

import { CategoryModal } from './CategoryModal';
import { allocations, categories, categoryHandlers, entryCounts, yearMonth } from '../fixtures';

const meta = {
  title: 'Categories/CategoryModal',
  component: CategoryModal,
  args: { categories, entryCounts, allocations, yearMonth, busy: false, fmt: IDR, ...categoryHandlers },
} satisfies Meta<typeof CategoryModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The populated list: a row per category with an inline allocation field. */
export const Populated: Story = {};

/** A fresh account — the bulk-seed offer appears only while the list is empty. */
export const Empty: Story = { args: { categories: [], entryCounts: {}, allocations: {} } };
