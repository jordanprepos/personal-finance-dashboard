import { onAuthStateChanged, signInAnonymously, type Auth, type User } from 'firebase/auth';

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
 * Picks the data source for this environment.
 *
 * With Firebase config present it signs in (anonymously, if no session
 * exists) and returns a live Firestore source. Without it — or if sign-in
 * fails — it returns the seed source plus a warning explaining which.
 */
export async function resolveSession(env: EnvRecord | undefined): Promise<Session> {
  const config = readFirebaseConfig(env);

  if (!config) {
    return {
      source: createSeedDataSource(),
      mode: 'seed',
      userId: 'demo-user',
      warning: `Demo data — set ${missingFirebaseEnvKeys(env).join(', ')} in .env to use Firestore.`,
    };
  }

  try {
    const { auth, db } = initFirebase(config);
    const user = await currentUser(auth);
    return {
      source: createFirestoreDataSource(db, user.uid),
      mode: 'firestore',
      userId: user.uid,
    };
  } catch (error) {
    return {
      source: createSeedDataSource(),
      mode: 'seed',
      userId: 'demo-user',
      warning: `Firebase sign-in failed (${describe(error)}) — showing demo data.`,
    };
  }
}

/** Resolves with the signed-in user, signing in anonymously if there is none. */
export function currentUser(auth: Auth): Promise<User> {
  return new Promise<User>((resolve, reject) => {
    const stop = onAuthStateChanged(
      auth,
      (user) => {
        stop();
        if (user) resolve(user);
        else signInAnonymously(auth).then((cred) => resolve(cred.user), reject);
      },
      (error) => {
        stop();
        reject(error);
      },
    );
  });
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
