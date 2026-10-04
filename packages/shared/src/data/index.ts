import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
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
export * from './defaultCategories.js';

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
 * Permanent-account sign-in, driven by the login screens through
 * `AuthController`. `AuthController.start` is what observes the session; there
 * is deliberately no anonymous path — every identity here is a real account.
 */
export function signUpWithEmail(auth: Auth, email: string, password: string): Promise<User> {
  return createUserWithEmailAndPassword(auth, email, password).then((cred) => cred.user);
}

export function signInWithEmail(auth: Auth, email: string, password: string): Promise<User> {
  return signInWithEmailAndPassword(auth, email, password).then((cred) => cred.user);
}

export function signInWithGoogle(auth: Auth): Promise<User> {
  const provider = new GoogleAuthProvider();
  // Without a `prompt`, Google completes silently whenever exactly one account
  // is signed in to the browser and has already consented — so signing out of
  // the app and clicking Continue with Google lands straight back in the same
  // ledger, with no account ever having been chosen. `signOutUser` cannot
  // prevent that: it clears the Firebase session, while the Google session is a
  // cookie on accounts.google.com that no site may clear. Forcing the chooser is
  // the half that is ours to control, and on a shared machine it is the half
  // that matters.
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider).then((cred) => cred.user);
}

export function signOutUser(auth: Auth): Promise<void> {
  return signOut(auth);
}

/**
 * Emails a reset link. No `actionCodeSettings`: without a `continueUrl` the
 * link lands on Firebase's own `/__/auth/action` page on the auth domain,
 * which is served whatever the default Hosting site's state (see the handler
 * note in CLAUDE.md) and needs no entry in the authorized-domains list.
 */
export function sendPasswordReset(auth: Auth, email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
