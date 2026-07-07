'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '../theme-provider';
import {
  DASHBOARD_ROLE_CHANGE_EVENT,
  DASHBOARD_ROLE_LABELS,
  DASHBOARD_ROLE_STORAGE_KEY,
  DASHBOARD_ROLES,
  DEFAULT_DASHBOARD_ROLE,
  isDashboardRole,
  type DashboardRole,
} from '../../lib/dashboard-role';
import type { Theme } from '../../lib/theme';

const THEME_OPTIONS: { value: Theme; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Bright surfaces, dark text.' },
  { value: 'dark', label: 'Dark', hint: 'Dark surfaces, light text. Default.' },
];

const SHOW_DEV_MODE = process.env.NODE_ENV !== 'production';

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
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

      <fieldset className="settings-group">
        <legend>Theme</legend>
        <div className="settings-radio-group" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <label key={option.value} className="settings-radio">
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => setTheme(option.value)}
              />
              <span className="settings-radio__label">
                {option.label}
                <span className="settings-radio__hint">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

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
