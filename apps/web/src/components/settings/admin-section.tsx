'use client';

import { DashboardStatusColorsSection } from './dashboard-status-colors-section';
import { SchedulerSettingsSection } from './scheduler-settings-section';
import { VisitPolicySection } from './visit-policy-section';
import { ServicesSection } from './services-section';

/** Settings > Admin — gated in settings/page.tsx on MANAGE_ADMIN_SETTINGS,
 *  groups the org-wide configuration that shouldn't live under Account. */
export function AdminSection() {
  return (
    <>
      <ServicesSection />
      <DashboardStatusColorsSection />
      <VisitPolicySection />
      <SchedulerSettingsSection />
    </>
  );
}
