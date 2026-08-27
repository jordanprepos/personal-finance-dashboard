import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthController, ExpenseStore } from '@expense-tracker/shared';

import '@expense-tracker/shared/styles.css';
import './styles.css';
import { App } from './App';

/*
 * The store no longer loads at module scope: it waits for an identity. The
 * auth controller resolves one (or reports that Firebase isn't configured),
 * and App drives `store.init` from that.
 */
const store = new ExpenseStore();
const auth = new AuthController();
auth.start(import.meta.env);

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App store={store} auth={auth} env={import.meta.env} />
  </StrictMode>,
);
