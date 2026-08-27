import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';

import { initFirebase, missingFirebaseEnvKeys, readFirebaseConfig, type EnvRecord } from '../firebase.js';
import { createFirestoreDataSource } from './firestoreSource.js';
import { createSeedDataSource } from './seedSource.js';
import type { ExpenseDataSource } from './source.js';

export type { ExpenseDataSource } from './source.js';
export { createFirestoreDataSource } from './firestoreSource.js';
export { createSeedDataSource } from './seedSource.js';
export * from './seedData.js';

export interface Session {
  source: ExpenseDataSource;
  mode: 'firestore' | 'seed';
  userId: string;
  /** Set when Firebase was configured but unusable — surface it, don't swallow it. */
  warning?: string;
}

/**
 * Picks the data source for an already-resolved identity.
 *
 * Authentication is deliberately *not* done here: `AuthController` owns it, so
 * that a signed-out state exists for the login screens to render. Given a
 * `userId` and Firebase config, this returns a live Firestore source; without
 * config — the case where there is nothing to sign in to — it returns the seed
 * source plus a warning saying so.
 */
export async function resolveSession(
  env: EnvRecord | undefined,
  userId?: string,
): Promise<Session> {
  const config = readFirebaseConfig(env);

  if (!config) {
    return {
      source: createSeedDataSource(),
      mode: 'seed',
      userId: 'demo-user',
      warning: `Demo data — set ${missingFirebaseEnvKeys(env).join(', ')} in .env to use Firestore.`,
    };
  }

  if (!userId) {
    return {
      source: createSeedDataSource(),
      mode: 'seed',
      userId: 'demo-user',
      warning: 'Not signed in — showing demo data.',
    };
  }

  try {
    const { db } = initFirebase(config);
    return { source: createFirestoreDataSource(db, userId), mode: 'firestore', userId };
  } catch (error) {
    return {
      source: createSeedDataSource(),
      mode: 'seed',
      userId: 'demo-user',
      warning: `Firestore unavailable (${describe(error)}) — showing demo data.`,
    };
  }
}

/**
 * Resolves with the current user, or null when nobody is signed in. Unlike the
 * anonymous-by-default helper it replaces, this never creates a session as a
 * side effect of asking whether one exists.
 */
export function currentUser(auth: Auth): Promise<User | null> {
  return new Promise<User | null>((resolve, reject) => {
    const stop = onAuthStateChanged(
      auth,
      (user) => {
        stop();
        resolve(user);
      },
      (error) => {
        stop();
        reject(error);
      },
    );
  });
}

/**
 * Anonymous sign-in, now an explicit opt-in rather than the path every startup
 * walked. Firestore rules still accept it — it's how a session existed before
 * either app had a login screen.
 */
export function signInAnonymousUser(auth: Auth): Promise<User> {
  return signInAnonymously(auth).then((cred) => cred.user);
}

/**
 * Permanent-account sign-in, driven by the login screens through
 * `AuthController`. Each either upgrades the existing anonymous session (if
 * signed in anonymously) or starts a new one — Firestore data written under
 * the anonymous uid does not automatically move to the linked account.
 */
export function signUpWithEmail(auth: Auth, email: string, password: string): Promise<User> {
  return createUserWithEmailAndPassword(auth, email, password).then((cred) => cred.user);
}

export function signInWithEmail(auth: Auth, email: string, password: string): Promise<User> {
  return signInWithEmailAndPassword(auth, email, password).then((cred) => cred.user);
}

export function signInWithGoogle(auth: Auth): Promise<User> {
  return signInWithPopup(auth, new GoogleAuthProvider()).then((cred) => cred.user);
}

export function signOutUser(auth: Auth): Promise<void> {
  return signOut(auth);
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
