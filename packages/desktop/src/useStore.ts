import { useSyncExternalStore } from 'react';
import type {
  AuthController,
  AuthState,
  ExpenseState,
  ExpenseStore,
} from '@expense-tracker/shared';

/** Binds a shared ExpenseStore to React. No store logic lives in this app. */
export function useStore(store: ExpenseStore): ExpenseState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Same binding for the auth controller — it exposes the same store shape. */
export function useAuth(auth: AuthController): AuthState {
  return useSyncExternalStore(auth.subscribe, auth.getSnapshot, auth.getSnapshot);
}
