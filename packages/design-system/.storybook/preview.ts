import type { Preview } from '@storybook/react-vite';

// Load order mirrors the shipped styles.css closure exactly: design tokens
// first, then the surface vocabularies. What Storybook renders is therefore
// what a design built from this system renders.
import '@expense-tracker/shared/styles.css';
import '../src/styles/index.css';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
};

export default preview;
