'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
        const body: unknown = await response.json().catch(() => null);
        const message =
          body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
            ? body.message
            : 'Invalid email or password.';
        setError(message);
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

  return (
    <form onSubmit={handleSubmit} noValidate>
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
    </form>
  );
}
