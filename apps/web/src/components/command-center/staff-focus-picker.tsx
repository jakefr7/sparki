'use client';

import type { DashboardPersonSummary } from '../../lib/patient-types';
import { personRoleLabel } from './card-helpers';

/**
 * Turns a shared terminal into one staff member's personal view: pick a
 * name and every queue card involving them gets a "For You" tag; check
 * "Mine only" to hide everyone else's work entirely. No login — just a
 * per-device preference, the same way theme.ts works.
 */
export function StaffFocusPicker({
  roster,
  focusStaffId,
  mineOnly,
  onFocusChange,
  onMineOnlyChange,
}: {
  roster: DashboardPersonSummary[];
  focusStaffId: string | null;
  mineOnly: boolean;
  onFocusChange: (staffId: string | null) => void;
  onMineOnlyChange: (mineOnly: boolean) => void;
}) {
  return (
    <div className="ops-staff-focus">
      <label htmlFor="ops-staff-focus-select" className="ops-staff-focus__label">
        Viewing as
      </label>
      <select
        id="ops-staff-focus-select"
        className="ops-staff-focus__select"
        value={focusStaffId ?? ''}
        onChange={(event) => onFocusChange(event.target.value || null)}
      >
        <option value="">Everyone</option>
        {roster.map((person) => (
          <option key={person.id} value={person.id}>
            {person.displayName} · {personRoleLabel(person)}
          </option>
        ))}
      </select>
      <label className="ops-staff-focus__toggle">
        <input
          type="checkbox"
          checked={mineOnly}
          disabled={!focusStaffId}
          onChange={(event) => onMineOnlyChange(event.target.checked)}
        />
        Mine only
      </label>
    </div>
  );
}
