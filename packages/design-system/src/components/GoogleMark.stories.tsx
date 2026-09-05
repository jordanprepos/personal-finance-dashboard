import type { Meta, StoryObj } from '@storybook/react-vite';

import { GoogleMark } from './GoogleMark';

const meta = {
  title: 'Brand/GoogleMark',
  component: GoogleMark,
} satisfies Meta<typeof GoogleMark>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The mark on its own — 17px, as it sits in the Login artboard. */
export const Default: Story = {};

/** How it is actually used: inside the Google sign-in button on both surfaces. */
export const InSignInButton: Story = {
  render: () => (
    <div style={{ background: 'var(--cf-page)', padding: 20, width: 320 }}>
      <button type="button" className="cf-cta cf-cta--outline login__google">
        <GoogleMark />
        Continue with Google
      </button>
    </div>
  ),
};
