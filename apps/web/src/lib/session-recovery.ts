/**
 * Call when a request proves the session cookie no longer resolves to an
 * active account (401) — expired, revoked, or the account itself was
 * deleted. `/`'s server-side check (cookieStore.has(SESSION_COOKIE_NAME))
 * only tests presence, not validity, so a stale-but-present cookie makes it
 * keep rendering the dashboard on every load, which 401s again — a loop.
 * Clearing the cookie server-side before navigating to /login breaks that.
 */
export async function recoverFromInvalidSession(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Best-effort — still redirect even if the logout call itself fails.
  }
  window.location.assign('/login');
}
