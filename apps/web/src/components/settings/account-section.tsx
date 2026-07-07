'use client';

import { useState } from 'react';
import { useCurrentUser } from '../../lib/use-current-user';

const ROLE_DISPLAY_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  PRACTICE_MANAGER: 'Practice Manager',
  FRONT_DESK: 'Receptionist',
  VETERINARIAN: 'Veterinarian',
  TECHNICIAN: 'Technician',
  ASSISTANT: 'Assistant',
  CLIENT: 'Client',
};

export function AccountSection() {
  const { user, loading } = useCurrentUser();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      // Full navigation (not router.push) so every client-side cache and
      // in-memory state from the previous session is discarded, and the
      // browser can't serve a cached protected page from history afterward.
      window.location.assign('/login');
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-account-heading">
      <h1 id="settings-account-heading">Account</h1>
      <p className="settings-section__intro">Manage your Sparki sign-in.</p>

      <fieldset className="settings-group">
        <legend>Signed in as</legend>
        <div className="settings-account-row">
          <div className="settings-account-row__identity">
            <strong>{loading ? 'Loading...' : (user?.name ?? 'Unknown')}</strong>
            <span>{user?.email}</span>
            {user && (
              <span className="settings-account-row__role">
                {ROLE_DISPLAY_LABELS[user.role] ?? user.role}
              </span>
            )}
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={handleSignOut}
            disabled={signingOut || loading}
          >
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </fieldset>
    </section>
  );
}
