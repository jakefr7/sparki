'use client';

import { useEffect, useState } from 'react';
import {
  DASHBOARD_ROLE_CHANGE_EVENT,
  DASHBOARD_ROLE_LABELS,
  DASHBOARD_ROLE_STORAGE_KEY,
  DASHBOARD_ROLES,
  DEFAULT_DASHBOARD_ROLE,
  isDashboardRole,
  type DashboardRole,
} from '../../lib/dashboard-role';

const SHOW_DEV_MODE = process.env.NODE_ENV !== 'production';

export function AppearanceSection() {
  const [dashboardRole, setDashboardRoleState] =
    useState<DashboardRole>(DEFAULT_DASHBOARD_ROLE);

  useEffect(() => {
    const storedRole = window.localStorage.getItem(DASHBOARD_ROLE_STORAGE_KEY);
    if (isDashboardRole(storedRole)) {
      setDashboardRoleState(storedRole);
    }
  }, []);

  const setDashboardRole = (role: DashboardRole) => {
    setDashboardRoleState(role);
    window.localStorage.setItem(DASHBOARD_ROLE_STORAGE_KEY, role);
    window.dispatchEvent(new CustomEvent(DASHBOARD_ROLE_CHANGE_EVENT, { detail: role }));
  };

  return (
    <section className="settings-section" aria-labelledby="settings-appearance-heading">
      <h1 id="settings-appearance-heading">Appearance</h1>
      <p className="settings-section__intro">Choose how Sparki looks on this device.</p>

      {SHOW_DEV_MODE && (
        <fieldset className="settings-group">
          <legend>Dev mode</legend>
          <label className="settings-select">
            <span className="settings-select__label">
              View
              <span className="settings-select__hint">
                Preview role-specific dashboard views on this device.
              </span>
            </span>
            <select
              value={dashboardRole}
              onChange={(event) => setDashboardRole(event.target.value as DashboardRole)}
            >
              {DASHBOARD_ROLES.map((role) => (
                <option key={role} value={role}>
                  {DASHBOARD_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      )}
    </section>
  );
}
