'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent, type MouseEvent } from 'react';

const RESEND_COOLDOWN_SECONDS = 60;

type Mode = 'password' | 'code-request' | 'code-verify';

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codeDigits, setCodeDigits] = useState<string[]>(Array(6).fill(''));
  const code = codeDigits.join('');
  const codeInputs = useRef<Array<HTMLInputElement | null>>([]);
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
      setCodeDigits(Array(6).fill(''));
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

  // Cancel the click default before replacing the form; method changes must never submit it.
  function switchToCodeMode(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setError(null);
    setMode('code-request');
  }

  function switchToPasswordMode(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setError(null);
    setMode('password');
  }

  if (mode === 'code-request') {
    return (
      <form key="code-request" data-login-mode="code-request" onSubmit={handleCodeRequestSubmit} noValidate>
        <p className="login-eyebrow">SIGN IN WITH EMAIL</p>
        <h1 id="login-heading">Get a sign-in code</h1>
        <p className="login-subtitle">We’ll email you a one-time code to sign in.</p>
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
          ← Back to password sign-in
        </button>
      </form>
    );
  }

  if (mode === 'code-verify') {
    return (
      <form key="code-verify" data-login-mode="code-verify" onSubmit={handleCodeVerifySubmit} noValidate>
        <p className="login-eyebrow">CHECK YOUR EMAIL</p>
        <h1 id="login-heading">Enter your code</h1>
        <p className="login-code-hint" id="login-code-hint">
          Enter the 6-digit code we sent to <strong>{email}</strong>.
        </p>
        <fieldset className="login-field login-code-field" aria-describedby="login-code-hint">
          <legend>Sign-in code</legend>
          <div className="login-code-digits">
            {Array.from({ length: 6 }, (_, index) => (
              <input
                key={index}
                ref={(element) => { codeInputs.current[index] = element; }}
                aria-label={`Digit ${index + 1} of 6`}
                aria-invalid={Boolean(error)}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                autoFocus={index === 0}
                className="login-code-digit"
                value={codeDigits[index]}
                onFocus={(event) => event.target.select()}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '');
                  if (digits.length > 1) {
                    const next = digits.slice(0, 6);
                    setCodeDigits(Array.from({ length: 6 }, (_, position) => next[position] ?? ''));
                    codeInputs.current[Math.min(next.length, 5)]?.focus();
                  } else {
                    setCodeDigits((current) => current.map((digit, position) => position === index ? digits : digit));
                    if (digits) codeInputs.current[Math.min(index + 1, 5)]?.focus();
                  }
                }}
                onPaste={(event) => {
                  event.preventDefault();
                  const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                  if (!digits) return;
                  setCodeDigits(Array.from({ length: 6 }, (_, position) => digits[position] ?? ''));
                  codeInputs.current[Math.min(digits.length, 5)]?.focus();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' && !codeDigits[index] && index > 0) {
                    event.preventDefault();
                    setCodeDigits((current) => current.map((digit, position) => position === index - 1 ? '' : digit));
                    codeInputs.current[index - 1]?.focus();
                  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    codeInputs.current[Math.max(0, Math.min(5, index + (event.key === 'ArrowLeft' ? -1 : 1)))]?.focus();
                  }
                }}
                disabled={submitting}
              />
            ))}
          </div>
        </fieldset>

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
            ← Back to password sign-in
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
    <form key="password" data-login-mode="password" onSubmit={handlePasswordSubmit} noValidate>
      <p className="login-eyebrow">WELCOME BACK</p>
      <h1 id="login-heading">Sign in</h1>
      <p className="login-subtitle">Pick up where your clinic left off.</p>
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

      <p className="login-code-option">
        Sign in with a{' '}
        <button type="button" className="login-code-link" aria-label="Sign in with a one-time code" onClick={switchToCodeMode} disabled={submitting}>
          one-time code
        </button>
      </p>
    </form>
  );
}

async function extractError(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
    ? body.message
    : fallback;
}
