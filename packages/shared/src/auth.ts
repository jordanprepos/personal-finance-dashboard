import {
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  type Auth,
  type User,
} from 'firebase/auth';

import { initFirebase, readFirebaseConfig, type EnvRecord } from './firebase.js';
import {
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail,
} from './data/index.js';
import { validateCredentials, validateEmail, type CredentialField } from './lib/forms.js';

/**
 * Framework-agnostic authentication state, shaped like `ExpenseStore` so both
 * front ends bind to it the same way:
 *
 *   useSyncExternalStore(auth.subscribe, auth.getSnapshot)
 *
 * The login screens are pure views over this — they own the typed text and
 * nothing else. Validation lives in `lib/forms.ts`; error wording lives here.
 */

export type AuthStatus =
  | 'checking'
  /** Firebase isn't configured — there is nothing to sign in to, so the apps
   * skip the gate and run on seed data (see `resolveSession`). */
  | 'unavailable'
  | 'signed-out'
  | 'signed-in';

/** Which credential flow the form is in. The view toggles it; both land here. */
export type AuthMode = 'signIn' | 'signUp';

export interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  /** message for the form's error slot, already worded for a person */
  error: string | null;
  /** set when the error belongs to one field, so that input can turn red */
  errorField: CredentialField | null;
  /** a non-error message for the same slot — today only "reset link sent" */
  notice: string | null;
  /** which request is in flight, '' when idle */
  busy: '' | 'email' | 'google' | 'reset';
}

const initialState: AuthState = {
  status: 'checking',
  userId: null,
  email: null,
  error: null,
  errorField: null,
  notice: null,
  busy: '',
};

export class AuthController {
  private state: AuthState = initialState;
  private listeners = new Set<() => void>();
  private auth: Auth | null = null;
  /** Unsubscribe for the auth-state watch, kept as `start`'s re-entrancy
   * guard. Nothing tears the watch down — both apps construct the controller
   * at module scope and it lives as long as the page. */
  private stopWatching: (() => void) | null = null;

  /* ------------------------------------------------------ subscription */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): AuthState => this.state;

  private set(patch: Partial<AuthState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /* ------------------------------------------------------------- setup */

  /**
   * Starts watching Firebase for a session. Without Firebase config there is
   * no auth at all — the status goes to `unavailable` and the apps fall
   * through to seed data rather than showing a login form that can never
   * succeed.
   */
  start(env: EnvRecord | undefined): void {
    if (this.stopWatching) return;

    const config = readFirebaseConfig(env);
    if (!config) {
      this.set({ status: 'unavailable' });
      return;
    }

    try {
      const { auth } = initFirebase(config);
      this.auth = auth;
      this.stopWatching = onAuthStateChanged(
        auth,
        (user) => this.adopt(user),
        (error) => this.set({ status: 'signed-out', ...describe(error) }),
      );
    } catch (error) {
      this.set({ status: 'unavailable', ...describe(error) });
    }
  }

  private adopt(user: User | null): void {
    if (user) {
      this.set({
        status: 'signed-in',
        userId: user.uid,
        email: user.email,
        error: null,
        errorField: null,
        busy: '',
      });
    } else {
      this.set({ status: 'signed-out', userId: null, email: null, busy: '' });
    }
  }

  /* ----------------------------------------------------------- actions */

  /** Clears the message slot — the error and the notice share it. */
  clearError(): void {
    if (this.state.error === null && this.state.errorField === null && this.state.notice === null) {
      return;
    }
    this.set({ error: null, errorField: null, notice: null });
  }

  /**
   * Email + password, in either mode. `remember` decides whether the session
   * outlives the tab — it must be applied before the sign-in call, so a
   * failure to set it doesn't silently downgrade to the default.
   */
  async submitCredentials(
    mode: AuthMode,
    email: string,
    password: string,
    remember: boolean,
  ): Promise<void> {
    const auth = this.auth;
    if (!auth || this.state.busy !== '') return;

    const invalid = validateCredentials(email, password);
    if (invalid) {
      this.set({ error: invalid.message, errorField: invalid.field, notice: null });
      return;
    }

    this.set({ busy: 'email', error: null, errorField: null, notice: null });
    try {
      await this.applyPersistence(auth, remember);
      const user =
        mode === 'signUp'
          ? await signUpWithEmail(auth, email.trim(), password)
          : await signInWithEmail(auth, email.trim(), password);
      // onAuthStateChanged also fires; adopting here avoids a flash of the
      // form between the promise resolving and the listener running.
      this.adopt(user);
    } catch (error) {
      this.set({ busy: '', ...describe(error) });
    }
  }

  async signInWithGooglePopup(remember: boolean): Promise<void> {
    const auth = this.auth;
    if (!auth || this.state.busy !== '') return;

    this.set({ busy: 'google', error: null, errorField: null, notice: null });
    try {
      await this.applyPersistence(auth, remember);
      this.adopt(await signInWithGoogle(auth));
    } catch (error) {
      this.set({ busy: '', ...describe(error) });
    }
  }

  /**
   * "Forgot password?". Takes the address already typed into the form, so
   * there is no second screen to collect it on.
   *
   * The confirmation is worded the same whether or not the address has an
   * account. With email-enumeration protection on (the default for projects
   * created since 2023) Firebase reports success either way, so a "no such
   * account" branch would be dead code — and saying "sent" outright would be
   * a promise the app cannot check.
   */
  async sendPasswordReset(email: string): Promise<void> {
    const auth = this.auth;
    if (!auth || this.state.busy !== '') return;

    const invalid = validateEmail(email);
    if (invalid) {
      this.set({
        error: 'Enter your email address above first, then try again.',
        errorField: invalid.field,
        notice: null,
      });
      return;
    }

    const address = email.trim();
    this.set({ busy: 'reset', error: null, errorField: null, notice: null });
    try {
      await sendPasswordReset(auth, address);
      this.set({
        busy: '',
        notice: `If ${address} has an account, a reset link is on its way. Check your inbox.`,
      });
    } catch (error) {
      this.set({ busy: '', ...describe(error) });
    }
  }

  async signOut(): Promise<void> {
    if (!this.auth) return;
    await signOutUser(this.auth);
    this.set({
      status: 'signed-out',
      userId: null,
      email: null,
      error: null,
      errorField: null,
      notice: null,
    });
  }

  private applyPersistence(auth: Auth, remember: boolean): Promise<void> {
    return setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  }
}

/* ------------------------------------------------------- error wording */

interface AuthFailure {
  error: string | null;
  errorField: CredentialField | null;
}

const BY_CODE: Record<string, AuthFailure> = {
  'auth/invalid-email': { error: 'Enter a valid email address.', errorField: 'email' },
  'auth/user-not-found': { error: 'No account found for that email.', errorField: 'email' },
  'auth/user-disabled': { error: 'That account has been disabled.', errorField: 'email' },
  'auth/email-already-in-use': {
    error: 'That email already has an account — sign in instead.',
    errorField: 'email',
  },
  'auth/wrong-password': { error: 'Email or password is incorrect.', errorField: 'password' },
  'auth/invalid-credential': { error: 'Email or password is incorrect.', errorField: 'password' },
  'auth/weak-password': {
    error: 'Password must be at least 6 characters.',
    errorField: 'password',
  },
  'auth/too-many-requests': {
    error: 'Too many attempts — wait a few minutes and try again.',
    errorField: null,
  },
  'auth/network-request-failed': {
    error: 'Network error — check your connection and try again.',
    errorField: null,
  },
  'auth/operation-not-allowed': {
    error: 'That sign-in method is not enabled for this project.',
    errorField: null,
  },
  'auth/popup-blocked': {
    error: 'Your browser blocked the sign-in popup — allow popups and try again.',
    errorField: null,
  },
  // The person closed the popup themselves; saying so would be noise.
  'auth/popup-closed-by-user': { error: null, errorField: null },
  'auth/cancelled-popup-request': { error: null, errorField: null },
};

const codeOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

const describe = (error: unknown): AuthFailure =>
  BY_CODE[codeOf(error)] ?? {
    error: error instanceof Error ? error.message : String(error),
    errorField: null,
  };
