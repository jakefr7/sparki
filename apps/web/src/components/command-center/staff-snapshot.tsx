import { useMemo } from 'react';
import { STAFF_OVERLOAD_THRESHOLD } from '../../lib/command-center-states';
import type { DashboardPersonSummary, OperationsDashboard } from '../../lib/patient-types';
import { personRoleLabel } from './card-helpers';
import { EmptyQueue } from './empty-states';
import { SectionShell } from './section-shell';

export function StaffSnapshot({
  dashboard,
  focusStaffId,
}: {
  dashboard: OperationsDashboard;
  focusStaffId?: string | null | undefined;
}) {
  const people = useMemo(() => {
    const records = new Map<
      string,
      {
        person: DashboardPersonSummary;
        active: number;
        upcoming: number;
        nextPatient: string;
      }
    >();

    function add(person: DashboardPersonSummary | null, kind: 'active' | 'upcoming', nextPatient: string) {
      if (!person) return;
      const existing =
        records.get(person.id) ??
        records
          .set(person.id, { person, active: 0, upcoming: 0, nextPatient })
          .get(person.id);
      if (!existing) return;
      existing[kind] += 1;
      if (!existing.nextPatient) existing.nextPatient = nextPatient;
    }

    for (const visit of dashboard.activeVisits) {
      add(visit.primaryVeterinarian, 'active', visit.patient.name);
      add(visit.assignedTechnician, 'active', visit.patient.name);
      add(visit.currentOwner, 'active', visit.patient.name);
    }
    for (const appointment of dashboard.upcomingAppointments) {
      add(appointment.provider, 'upcoming', appointment.patient?.name ?? 'Unlinked patient');
    }

    return Array.from(records.values()).sort(
      (a, b) => b.active - a.active || b.upcoming - a.upcoming || a.person.displayName.localeCompare(b.person.displayName),
    );
  }, [dashboard]);

  const overloadedCount = people.filter(({ active }) => active >= STAFF_OVERLOAD_THRESHOLD).length;

  return (
    <SectionShell
      title="Provider / Technician Context"
      count={people.length}
      tone="rail"
      attentionCount={overloadedCount}
    >
      {people.length > 0 ? (
        <div className="ops-provider-list">
          {people.slice(0, 8).map(({ person, active, upcoming, nextPatient }) => {
            const overloaded = active >= STAFF_OVERLOAD_THRESHOLD;
            const isMine = person.id === focusStaffId;
            return (
              <div
                key={person.id}
                className={[
                  'ops-provider-row',
                  overloaded && 'ops-provider-row--overloaded',
                  isMine && 'ops-provider-row--mine',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div>
                  <strong>{person.displayName}</strong>
                  <span>{personRoleLabel(person)}</span>
                </div>
                <div>
                  <strong>{active}</strong>
                  <span>Active</span>
                </div>
                <div>
                  <strong>{upcoming}</strong>
                  <span>Upcoming</span>
                </div>
                {overloaded && <span className="ops-tag ops-tag--warning ops-provider-row__overload">Overloaded</span>}
                {isMine && <span className="ops-tag ops-tag--accent ops-provider-row__overload">You</span>}
                <p>{nextPatient || 'No patient queued'}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyQueue label="No provider or technician assignments in the current dashboard snapshot." />
      )}
    </SectionShell>
  );
}
