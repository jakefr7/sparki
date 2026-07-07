import { DashboardShell } from '../../components/dashboard-shell';
import { AppearanceSection } from '../../components/settings/appearance-section';

const UPCOMING_SECTIONS = ['Notifications', 'Clinic', 'Users', 'Keyboard Shortcuts', 'About'];

export default function SettingsPage() {
  return (
    <DashboardShell activeHref="/settings" eyebrow="Settings" title="Settings">
      <div className="settings-page">
        <nav aria-label="Settings sections">
          <ul className="settings-nav">
            <li>
              <span className="settings-nav__item settings-nav__item--active">Appearance</span>
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

        <AppearanceSection />
      </div>
    </DashboardShell>
  );
}
