import Link from 'next/link';
import { timeLabel } from '../../lib/format';
import type { DashboardPersonSummary, OperationsDashboard } from '../../lib/patient-types';
import { PatientSearch } from '../patient-search';
import type { ClinicHealth } from './card-helpers';
import { StaffFocusPicker } from './staff-focus-picker';
import { SparkiLogo } from '../sparki-logo';

const CLINIC_HEALTH_LABEL: Record<ClinicHealth, string> = {
  calm: 'Calm',
  busy: 'Busy',
  pressure: 'Under Pressure',
};

export function CommandCenterHeader({
  dashboard,
  refreshing,
  isStale,
  clinicHealth,
  roster,
  focusStaffId,
  mineOnly,
  onFocusChange,
  onMineOnlyChange,
}: {
  dashboard: OperationsDashboard | null;
  refreshing: boolean;
  isStale: boolean;
  clinicHealth: ClinicHealth;
  roster: DashboardPersonSummary[];
  focusStaffId: string | null;
  mineOnly: boolean;
  onFocusChange: (staffId: string | null) => void;
  onMineOnlyChange: (mineOnly: boolean) => void;
}) {
  return (
    <>
      <header className="command-home-header command-home-header--ops">
        <span className="app-brand" role="img" aria-label="Sparki"><SparkiLogo kind="mark" className="app-brand__logo" /></span>
        <div className="command-home-header__actions">
          <div className="ops-clinic-health" data-health={clinicHealth} aria-label="Clinic health">
            <span className="ops-clinic-health__dot" aria-hidden="true" />
            {CLINIC_HEALTH_LABEL[clinicHealth]}
          </div>
          <div
            className="ops-status-badge"
            data-state={refreshing ? 'refreshing' : isStale ? 'stale' : 'live'}
            aria-label="Clinic status"
          >
            <span className="ops-status-badge__dot" aria-hidden="true" />
            <span className="ops-status-badge__text">
              <span className="ops-status-badge__label">
                {refreshing ? 'Refreshing' : isStale ? 'Stale' : 'Live'}
              </span>
              <span className="ops-status-badge__meta">
                {dashboard ? `Updated ${timeLabel(dashboard.generatedAt)}` : 'Loading floor'}
              </span>
            </span>
          </div>
          <Link href="/settings" className="settings-link" aria-label="Settings" title="Settings">
            ⚙
          </Link>
        </div>
      </header>

      <section className="ops-search-console" aria-label="Command lookup">
        <div className="ops-search-console__header">
          <div>
            <p className="eyebrow">Command lookup</p>
            <h2>Find the visit, client, or patient</h2>
          </div>
          <div className="ops-search-console__actions">
            <StaffFocusPicker
              roster={roster}
              focusStaffId={focusStaffId}
              mineOnly={mineOnly}
              onFocusChange={onFocusChange}
              onMineOnlyChange={onMineOnlyChange}
            />
            <Link href="/patients/new" className="button-primary ops-registration-action">
              Register Client
            </Link>
            <span className="ops-search-console__mode">Live records</span>
          </div>
        </div>
        <PatientSearch />
      </section>
    </>
  );
}
