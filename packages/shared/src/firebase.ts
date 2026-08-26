import { initializeApp, getApps, getApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Firebase config comes from environment variables — never hardcode it here.
 * Each app passes its own `import.meta.env` in, so Vite can inline the values
 * at build time:
 *
 *   initFirebase(readFirebaseConfig(import.meta.env)!)
 *
 * These `VITE_`-prefixed values ship in the client bundle by design. Firebase
 * web config is public identification, not a secret; access is enforced by the
 * Firestore rules in `firebase/firestore.rules`.
 */

export type EnvRecord = Record<string, unknown>;

const CONFIG_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const;

const REQUIRED = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;

const read = (env: EnvRecord, key: string): string | undefined => {
  const value = env[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

/** Returns null when the environment has no usable Firebase config. */
export function readFirebaseConfig(env: EnvRecord | undefined): FirebaseOptions | null {
  if (!env) return null;

  const config: Record<string, string> = {};
  for (const [field, envKey] of Object.entries(CONFIG_KEYS)) {
    const value = read(env, envKey);
    if (value !== undefined) config[field] = value;
  }

  const missing = REQUIRED.filter((field) => config[field] === undefined);
  if (missing.length > 0) return null;

  const measurementId = read(env, 'VITE_FIREBASE_MEASUREMENT_ID');
  if (measurementId) config['measurementId'] = measurementId;

  return config as FirebaseOptions;
}

export function isFirebaseConfigured(env: EnvRecord | undefined): boolean {
  return readFirebaseConfig(env) !== null;
}

/** Names the env vars that are missing, for a useful startup message. */
export function missingFirebaseEnvKeys(env: EnvRecord | undefined): string[] {
  return REQUIRED.map((field) => CONFIG_KEYS[field]).filter((key) => read(env ?? {}, key) === undefined);
}

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

const APP_NAME = 'expense-tracker';
/** Not "(default)" — this project's default database is locked to nam5 (US);
 * this named database lives in asia-southeast2 instead. */
const FIRESTORE_DATABASE_ID = 'expense-tracker';
let services: FirebaseServices | null = null;

/** Idempotent — repeated calls return the same app, auth and Firestore handles. */
export function initFirebase(config: FirebaseOptions): FirebaseServices {
  if (services) return services;

  const app = getApps().some((a) => a.name === APP_NAME)
    ? getApp(APP_NAME)
    : initializeApp(config, APP_NAME);

  services = { app, auth: getAuth(app), db: getFirestore(app, FIRESTORE_DATABASE_ID) };
  return services;
}

export function getFirebase(): FirebaseServices {
  if (!services) {
    throw new Error('Firebase has not been initialised — call initFirebase(config) first.');
  }
  return services;
}
