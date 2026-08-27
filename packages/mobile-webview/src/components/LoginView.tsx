import { useState, type FormEvent, type JSX } from 'react';
import { currentYearMonth, monthLabel, type AuthController, type AuthState } from '@expense-tracker/shared';

import { GoogleMark } from './GoogleMark';

/**
 * Mobile login, ported from the Claude Design `Login.dc.html` phone artboard:
 * a dark header block over a single scrolling form column, 48px inputs.
 *
 * The prototype's Desktop/Mobile toggle chips are scaffolding for showing both
 * viewports in one file and are deliberately not carried over.
 */
export function LoginView({
  auth,
  state,
}: {
  auth: AuthController;
  state: AuthState;
}): JSX.Element {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);

  const busy = state.busy !== '';
  const signingUp = mode === 'signUp';
  // The prototype hardcoded "August"; the real thing lands you in this month.
  const month = monthLabel(currentYearMonth()).split(' ')[0];

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    auth.clearError();
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void auth.submitCredentials(mode, email, password, remember);
  };

  const borderFor = (field: 'email' | 'password'): string =>
    state.errorField === field ? 'var(--cf-danger)' : 'var(--cf-border-strong)';

  return (
    <div className="cf-phone login">
      <div className="login__hero">
        <div className="login__logo">
          <span className="login__mark" />
          <span className="login__wordmark">Alokasi Keuangan</span>
        </div>
        <div className="login__headline">Every rupiah has a place before the month starts.</div>
      </div>

      <form className="login__form" onSubmit={submit}>
        <div>
          <div className="login__title">{signingUp ? 'Create your account' : 'Welcome back'}</div>
          <div className="login__titlesub">
            {signingUp ? `Start allocating ${month}.` : `Sign in to pick up ${month}.`}
          </div>
        </div>

        <button
          type="button"
          className="cf-cta cf-cta--outline login__google"
          disabled={busy}
          onClick={() => void auth.signInWithGooglePopup(remember)}
        >
          <GoogleMark />
          {state.busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
        </button>

        <div className="login__or">
          <span className="login__rule" />
          or
          <span className="login__rule" />
        </div>

        <div className="login__fields">
          <label className="login__field">
            <span className="login__label">Email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              className="login__input"
              style={{ borderColor: borderFor('email') }}
              value={email}
              onChange={(e) => edit(setEmail)(e.target.value)}
              placeholder="you@email.com"
            />
          </label>

          <label className="login__field">
            <span className="login__label">
              Password
              <span className="cf-spacer" />
              <button type="button" className="login__pwtoggle" onClick={() => setShowPw(!showPw)}>
                {showPw ? 'Hide' : 'Show'}
              </button>
            </span>
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete={signingUp ? 'new-password' : 'current-password'}
              className="login__input"
              style={{ borderColor: borderFor('password') }}
              value={password}
              onChange={(e) => edit(setPassword)(e.target.value)}
              placeholder="••••••••"
            />
          </label>
        </div>

        <div className="login__row">
          <button
            type="button"
            className="login__remember"
            aria-pressed={remember}
            onClick={() => setRemember(!remember)}
          >
            <span
              className="login__checkbox"
              style={{
                background: remember ? 'var(--cf-blue)' : 'transparent',
                borderColor: remember ? 'var(--cf-blue)' : 'var(--cf-border-strong)',
              }}
            >
              {remember ? '✓' : ''}
            </span>
            Keep me signed in
          </button>
          <span className="cf-spacer" />
          {/* Inert in the design too — there is no reset flow yet. */}
          <span className="login__muted">Forgot?</span>
        </div>

        {state.error ? <div className="login__error">{state.error}</div> : null}

        <button type="submit" className="cf-cta cf-cta--primary login__submit" disabled={busy}>
          {state.busy === 'email'
            ? signingUp
              ? 'Creating account…'
              : 'Signing in…'
            : signingUp
              ? 'Create account'
              : 'Sign in'}
        </button>

        <div className="login__footer">
          {signingUp ? 'Already have an account? ' : 'No account yet? '}
          <button
            type="button"
            className="login__link"
            onClick={() => {
              setMode(signingUp ? 'signIn' : 'signUp');
              auth.clearError();
            }}
          >
            {signingUp ? 'Sign in' : 'Create one'}
          </button>
        </div>
      </form>
    </div>
  );
}
