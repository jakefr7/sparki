import { DashboardShell } from '../../components/dashboard-shell';
import { AccountSection } from '../../components/settings/account-section';
import { AppearanceSection } from '../../components/settings/appearance-section';
import { SchedulerSettingsSection } from '../../components/settings/scheduler-settings-section';

const UPCOMING_SECTIONS = ['Notifications', 'Clinic', 'Users', 'Keyboard Shortcuts', 'About'];

export default function SettingsPage() {
  return (
    <DashboardShell activeHref="/settings" eyebrow="Settings" title="Settings">
      <div className="settings-page">
        <nav aria-label="Settings sections">
          <ul className="settings-nav">
            <li>
              <span className="settings-nav__item settings-nav__item--active">Account</span>
            </li>
            <li>
              <span className="settings-nav__item">Appearance</span>
            </li>
            <li>
              <span className="settings-nav__item">Scheduler</span>
            </li>
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
          <AccountSection />
          <AppearanceSection />
          <SchedulerSettingsSection />
        </div>
      </div>
    </DashboardShell>
  );
}
