'use client';

import { useState } from 'react';
import { DashboardStatusColorsSection } from './dashboard-status-colors-section';
import { SchedulerSettingsSection } from './scheduler-settings-section';
import { VisitPolicySection } from './visit-policy-section';
import { DateExceptionsSection } from './date-exceptions-section';
import { ServicesSection } from './services-section';

const GROUPS = [
  {
    id: 'scheduling',
    name: 'Scheduling',
    description: 'Appointment types, weekly availability, and closures',
    icon: 'calendar',
  },
  {
    id: 'workflow',
    name: 'Visit workflow',
    description: 'Names and colors for each step of care',
    icon: 'workflow',
  },
  {
    id: 'billing',
    name: 'Services & checkout',
    description: 'Invoice charges and checkout preferences',
    icon: 'billing',
  },
  {
    id: 'permissions',
    name: 'Clinical permissions',
    description: 'Record signing and medication access',
    icon: 'permissions',
  },
] as const;

function GroupIcon({ icon }: { icon: string }) {
  const paths: Record<string, string> = {
    calendar:
      'M5 3v4m14-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
    workflow: 'M5 4h5v5H5zM14 15h5v5h-5zM8 9v8h6M10 6h7v9',
    billing: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6',
    permissions: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6',
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={paths[icon]}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Hidden panels stay mounted so navigating Admin doesn't discard edits. */
export function AdminSection() {
  const [active, setActive] = useState<string>('scheduling');
  return (
    <div className="admin-settings">
      <header className="admin-settings__heading">
        <div>
          <p className="eyebrow">Clinic administration</p>
          <h2>Clinic settings</h2>
          <p>Manage the details behind a smooth day of patient care.</p>
        </div>
        <a className="button-secondary" href="/scheduler">
          Open Scheduler <span aria-hidden="true">↗</span>
        </a>
      </header>
      <nav className="admin-settings__nav" aria-label="Admin settings groups">
        {GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            aria-current={active === group.id ? 'page' : undefined}
            aria-controls={`admin-panel-${group.id}`}
            onClick={() => setActive(group.id)}
          >
            <span className="admin-settings__icon">
              <GroupIcon icon={group.icon} />
            </span>
            <span>
              <strong>{group.name}</strong>
              <small>{group.description}</small>
            </span>
          </button>
        ))}
      </nav>
      <div
        id="admin-panel-scheduling"
        className="admin-settings__panel"
        hidden={active !== 'scheduling'}
      >
        <SchedulerSettingsSection />
        <DateExceptionsSection />
      </div>
      <div
        id="admin-panel-workflow"
        className="admin-settings__panel"
        hidden={active !== 'workflow'}
      >
        <DashboardStatusColorsSection />
      </div>
      <div id="admin-panel-billing" className="admin-settings__panel" hidden={active !== 'billing'}>
        <ServicesSection />
        <VisitPolicySection mode="checkout" />
      </div>
      <div
        id="admin-panel-permissions"
        className="admin-settings__panel"
        hidden={active !== 'permissions'}
      >
        <VisitPolicySection mode="permissions" />
      </div>
    </div>
  );
}
