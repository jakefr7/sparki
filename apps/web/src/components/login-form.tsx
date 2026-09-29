'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const RESEND_COOLDOWN_SECONDS = 60;

type Mode = 'password' | 'code-request' | 'code-verify';

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError(await extractError(response, 'Invalid email or password.'));
        setSubmitting(false);
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  async function requestCode(nextMode: Mode) {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/email-code/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        setError(await extractError(response, 'Could not send a sign-in code.'));
        setSubmitting(false);
        return;
      }

      setMode(nextMode);
      setCode('');
      startResendCooldown();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function startResendCooldown() {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    const timer = setInterval(() => {
      setResendCooldown((current) => {
        if (current <= 1) {
          clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  async function handleCodeRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestCode('code-verify');
  }

  async function handleCodeVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/email-code/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      if (!response.ok) {
        setError(await extractError(response, 'That code is invalid or expired.'));
        setSubmitting(false);
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  function togglePasswordVisibility() {
    setShowPassword((current) => !current);
  }

  function switchToCodeMode() {
    setError(null);
    setMode('code-request');
  }

  function switchToPasswordMode() {
    setError(null);
    setMode('password');
  }

  if (mode === 'code-request') {
    return (
      <form onSubmit={handleCodeRequestSubmit} noValidate>
        <div className="login-field">
          <label htmlFor="login-email-code">Email</label>
          <input
            id="login-email-code"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
          />
        </div>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="button-primary login-submit" disabled={submitting}>
          {submitting ? 'Sending code...' : 'Send sign-in code'}
        </button>

        <button type="button" className="login-mode-toggle" onClick={switchToPasswordMode} disabled={submitting}>
          ← Sign in with a password instead
        </button>
      </form>
    );
  }

  if (mode === 'code-verify') {
    return (
      <form onSubmit={handleCodeVerifySubmit} noValidate>
        <p className="login-code-hint">
          Enter the 6-digit code we sent to <strong>{email}</strong>.
        </p>
        <div className="login-field">
          <label htmlFor="login-code">Sign-in code</label>
          <input
            id="login-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className="login-code-input"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            disabled={submitting}
          />
        </div>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="button-primary login-submit" disabled={submitting || code.length !== 6}>
          {submitting ? 'Verifying...' : 'Verify and sign in'}
        </button>

        <div className="login-code-actions">
          <button type="button" className="login-mode-toggle" onClick={switchToPasswordMode} disabled={submitting}>
            Use a different sign-in method
          </button>
          <button
            type="button"
            className="login-mode-toggle"
            onClick={() => requestCode('code-verify')}
            disabled={submitting || resendCooldown > 0}
          >
            {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handlePasswordSubmit} noValidate>
      <div className="login-field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={submitting}
        />
      </div>
      <div className="login-field">
        <label htmlFor="login-password">Password</label>
        <div className="login-password-control">
          <input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
          />
          <button
            type="button"
            className="login-password-toggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            onMouseDown={(event) => {
              event.preventDefault();
              togglePasswordVisibility();
            }}
            onClick={(event) => {
              if (event.detail === 0) {
                togglePasswordVisibility();
              }
            }}
            disabled={submitting}
          >
            {showPassword ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3.3 3.3 20.7 20.7" />
                <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                <path d="M9.2 5.5A8.8 8.8 0 0 1 12 5c5 0 8.5 4.5 9.3 5.7a1.8 1.8 0 0 1 0 2.1 18 18 0 0 1-2.1 2.5" />
                <path d="M14.8 18.5a8.8 8.8 0 0 1-2.8.5c-5 0-8.5-4.5-9.3-5.7a1.8 1.8 0 0 1 0-2.1 18.2 18.2 0 0 1 3-3.4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M2.7 10.7C3.5 9.5 7 5 12 5s8.5 4.5 9.3 5.7a1.8 1.8 0 0 1 0 2.1C20.5 14 17 19 12 19s-8.5-5-9.3-6.2a1.8 1.8 0 0 1 0-2.1Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="button-primary login-submit" disabled={submitting}>
        {submitting ? 'Signing in...' : 'Sign in'}
      </button>

      <button type="button" className="login-mode-toggle" onClick={switchToCodeMode} disabled={submitting}>
        Sign in with an email code instead
      </button>
    </form>
  );
}

async function extractError(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
    ? body.message
    : fallback;
}
