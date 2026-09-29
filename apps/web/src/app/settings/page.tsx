'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DashboardShell } from '../../components/dashboard-shell';
import { AdminSection } from '../../components/settings/admin-section';
import { AppearanceSection } from '../../components/settings/appearance-section';
import { ProfileSection } from '../../components/settings/profile-section';
import { TeamSection } from '../../components/settings/team-section';
import { useCurrentUser } from '../../lib/use-current-user';
import { MANAGE_ADMIN_SETTINGS } from '../../lib/permissions';

type TabId = 'profile' | 'appearance' | 'admin' | 'team';

export default function SettingsPage() {
  const { user, loading } = useCurrentUser();
  const isAdmin = Boolean(user?.permissions.includes(MANAGE_ADMIN_SETTINGS));
  const canManageTeam = !loading && (user?.role === 'OWNER' || user?.role === 'PRACTICE_MANAGER');
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmingSignOut) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !signingOut) setConfirmingSignOut(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [confirmingSignOut, signingOut]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        setSignOutError('Could not sign out. Please try again.');
        setSigningOut(false);
        return;
      }
      window.location.assign('/');
    } catch {
      setSignOutError('Could not sign out. Please try again.');
      setSigningOut(false);
    }
  }

  return (
    <DashboardShell activeHref="/settings" eyebrow="Settings" title="Settings">
      <div className="settings-page">
        <nav aria-label="Settings sections">
          <ul className="settings-nav">
            <li><button type="button" className={activeTab === 'profile' ? 'settings-nav__item settings-nav__item--active' : 'settings-nav__item'} aria-current={activeTab === 'profile' ? 'page' : undefined} onClick={() => setActiveTab('profile')}>Profile</button></li>
            <li>
              <button
                type="button"
                className={
                  activeTab === 'appearance'
                    ? 'settings-nav__item settings-nav__item--active'
                    : 'settings-nav__item'
                }
                aria-current={activeTab === 'appearance' ? 'page' : undefined}
                onClick={() => setActiveTab('appearance')}
              >
                Appearance
              </button>
            </li>
            {canManageTeam ? <li><button type="button" className={activeTab === 'team' ? 'settings-nav__item settings-nav__item--active' : 'settings-nav__item'} aria-current={activeTab === 'team' ? 'page' : undefined} onClick={() => setActiveTab('team')}>Team</button></li> : null}
            {isAdmin ? (
              <li>
                <button
                  type="button"
                  className={
                    activeTab === 'admin'
                      ? 'settings-nav__item settings-nav__item--active'
                      : 'settings-nav__item'
                  }
                  aria-current={activeTab === 'admin' ? 'page' : undefined}
                  onClick={() => setActiveTab('admin')}
                >
                  Admin
                </button>
              </li>
            ) : null}
            <li className="settings-nav__sign-out-row">
              <button type="button" className="settings-nav__item settings-nav__sign-out" onClick={() => { setSignOutError(null); setConfirmingSignOut(true); }}>
                Sign out
              </button>
            </li>
          </ul>
        </nav>

        <div className="settings-sections-stack">
          {activeTab === 'profile' && <ProfileSection />}
          {activeTab === 'appearance' && <AppearanceSection />}
          {activeTab === 'admin' && isAdmin && <AdminSection />}
          {activeTab === 'team' && canManageTeam && user && <TeamSection user={user} />}
        </div>
      </div>
      {confirmingSignOut ? createPortal(
        <div className="settings-sign-out-backdrop" role="presentation" onMouseDown={() => { if (!signingOut) setConfirmingSignOut(false); }}>
          <section className="settings-sign-out-dialog" role="dialog" aria-modal="true" aria-labelledby="sign-out-heading" aria-describedby="sign-out-description" onMouseDown={(event) => event.stopPropagation()}>
            <div className="settings-sign-out-dialog__icon" aria-hidden="true">↗</div>
            <h2 id="sign-out-heading">Sign out of Sparki?</h2>
            <p id="sign-out-description">You’ll need to sign in again to access your clinic workspace.</p>
            {signOutError ? <p className="settings-sign-out-dialog__error" role="alert">{signOutError}</p> : null}
            <div className="settings-sign-out-dialog__actions">
              <button type="button" className="settings-sign-out-dialog__cancel" onClick={() => setConfirmingSignOut(false)} disabled={signingOut}>Cancel</button>
              <button type="button" className="settings-sign-out-dialog__confirm" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </DashboardShell>
  );
}
