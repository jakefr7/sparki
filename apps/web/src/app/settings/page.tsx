'use client';

import { useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { AccountSection } from '../../components/settings/account-section';
import { AdminSection } from '../../components/settings/admin-section';
import { AppearanceSection } from '../../components/settings/appearance-section';
import { useCurrentUser } from '../../lib/use-current-user';
import { MANAGE_ADMIN_SETTINGS } from '../../lib/permissions';

const UPCOMING_SECTIONS = ['Notifications', 'Clinic', 'Users', 'Keyboard Shortcuts', 'About'];

type TabId = 'account' | 'appearance' | 'admin';

export default function SettingsPage() {
  const { user } = useCurrentUser();
  const isAdmin = Boolean(user?.permissions.includes(MANAGE_ADMIN_SETTINGS));
  const [activeTab, setActiveTab] = useState<TabId>('account');

  return (
    <DashboardShell activeHref="/settings" eyebrow="Settings" title="Settings">
      <div className="settings-page">
        <nav aria-label="Settings sections">
          <ul className="settings-nav">
            <li>
              <button
                type="button"
                className={
                  activeTab === 'account'
                    ? 'settings-nav__item settings-nav__item--active'
                    : 'settings-nav__item'
                }
                aria-current={activeTab === 'account' ? 'page' : undefined}
                onClick={() => setActiveTab('account')}
              >
                Account
              </button>
            </li>
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
            {UPCOMING_SECTIONS.map((section) => (
              <li key={section}>
                <span className="settings-nav__item settings-nav__item--disabled">
                  {section}
                  <span className="settings-nav__soon">Soon</span>
                </span>
              </li>
            ))}
          </ul>
        </nav>

        <div className="settings-sections-stack">
          {activeTab === 'account' && <AccountSection />}
          {activeTab === 'appearance' && <AppearanceSection />}
          {activeTab === 'admin' && isAdmin && <AdminSection />}
        </div>
      </div>
    </DashboardShell>
  );
}
