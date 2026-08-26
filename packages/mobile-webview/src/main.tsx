import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ExpenseStore } from '@expense-tracker/shared';

import '@expense-tracker/shared/styles.css';
import './styles.css';
import { App } from './App';

const store = new ExpenseStore();
void store.init(import.meta.env);

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
