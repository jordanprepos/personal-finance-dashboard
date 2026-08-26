import { useSyncExternalStore } from 'react';
import type { ExpenseState, ExpenseStore } from '@expense-tracker/shared';

/** Binds a shared ExpenseStore to React. No store logic lives in this app. */
export function useStore(store: ExpenseStore): ExpenseState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
