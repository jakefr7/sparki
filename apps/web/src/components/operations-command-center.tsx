'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppointmentQueue } from './command-center/appointment-queue';
import { collectStaffRoster, computeClinicHealth, visitMatchesStaff } from './command-center/card-helpers';
import { CommandCenterHeader } from './command-center/command-center-header';
import { CommandCenterMetrics } from './command-center/command-center-metrics';
import { OperationalAlerts } from './command-center/operational-alerts';
import { PriorityQueue } from './command-center/priority-queue';
import { SectionShell } from './command-center/section-shell';
import { EmptyQueue } from './command-center/empty-states';
import { StaffSnapshot } from './command-center/staff-snapshot';
import { VisitQueue } from './command-center/visit-queue';
import { enumLabel } from '../lib/format';
import { STAFF_FOCUS_STORAGE_KEY } from '../lib/staff-focus';
import { useOperationsDashboard } from '../lib/use-operations-dashboard';

export function OperationsCommandCenter() {
  const { dashboard, loading, refreshing, error, isStale, groups, refresh } = useOperationsDashboard();
  const [focusStaffId, setFocusStaffId] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => {
    setFocusStaffId(window.localStorage.getItem(STAFF_FOCUS_STORAGE_KEY));
  }, []);

  const handleFocusChange = useCallback((staffId: string | null) => {
    setFocusStaffId(staffId);
    if (staffId) window.localStorage.setItem(STAFF_FOCUS_STORAGE_KEY, staffId);
    else window.localStorage.removeItem(STAFF_FOCUS_STORAGE_KEY);
    if (!staffId) setMineOnly(false);
  }, []);

  const roster = useMemo(() => collectStaffRoster(dashboard), [dashboard]);
  const clinicHealth = useMemo(() => computeClinicHealth(groups), [groups]);

  const visibleGroups = useMemo(() => {
    if (!mineOnly || !focusStaffId) return groups;
    return {
      ...groups,
      waitingVisits: groups.waitingVisits.filter((visit) => visitMatchesStaff(visit, focusStaffId)),
      examReadyVisits: groups.examReadyVisits.filter((visit) => visitMatchesStaff(visit, focusStaffId)),
      checkoutVisits: groups.checkoutVisits.filter((visit) => visitMatchesStaff(visit, focusStaffId)),
      inProgressVisits: groups.inProgressVisits.filter((visit) => visitMatchesStaff(visit, focusStaffId)),
      upcomingAppointments: groups.upcomingAppointments.filter(
        (appointment) => appointment.provider?.id === focusStaffId,
      ),
    };
  }, [groups, mineOnly, focusStaffId]);

  const emptySuffix = mineOnly ? ' None assigned to you right now.' : '';

  return (
    <main className="page page--ops">
      <CommandCenterHeader
        dashboard={dashboard}
        refreshing={refreshing}
        isStale={isStale}
        clinicHealth={clinicHealth}
        roster={roster}
        focusStaffId={focusStaffId}
        mineOnly={mineOnly}
        onFocusChange={handleFocusChange}
        onMineOnlyChange={setMineOnly}
      />

      <OperationalAlerts loading={loading} error={error} groups={groups} />

      {!loading && !error && dashboard && (
        <>
          <CommandCenterMetrics summary={dashboard.summary} waitingVisits={groups.waitingVisits} updating={refreshing || isStale} />

          <PriorityQueue groups={groups} onVisitStarted={refresh} focusStaffId={focusStaffId} />

          <div className="ops-dashboard-grid">
            <div className="ops-dashboard-grid__main">
              <VisitQueue
                title="Waiting / Arrived"
                tone="waiting"
                visits={visibleGroups.waitingVisits}
                emptyLabel={`No arrived patients are waiting on the floor.${emptySuffix}`}
                onVisitStarted={refresh}
                focusStaffId={focusStaffId}
              />

              <VisitQueue
                title="Exam Ready / Ready for Doctor"
                tone="exam"
                visits={visibleGroups.examReadyVisits}
                emptyLabel={`No patients are ready for the doctor.${emptySuffix}`}
                onVisitStarted={refresh}
                cardVariant="exam-ready"
                focusStaffId={focusStaffId}
              />

              <VisitQueue
                title="In Progress / Active Visits"
                tone="active"
                visits={visibleGroups.inProgressVisits}
                emptyLabel={`No active visits are currently in progress.${emptySuffix}`}
                onVisitStarted={refresh}
                focusStaffId={focusStaffId}
              />

              <VisitQueue
                title="Ready for Checkout"
                tone="checkout"
                visits={visibleGroups.checkoutVisits}
                emptyLabel={`No visits are waiting for checkout.${emptySuffix}`}
                onVisitStarted={refresh}
                focusStaffId={focusStaffId}
              />

              <AppointmentQueue
                title="Completed Today"
                tone="completed"
                appointments={groups.completedAppointments}
                emptyLabel="No completed appointments are present in today's snapshot."
                cardTone="completed"
              />
            </div>

            <aside className="ops-dashboard-grid__rail" aria-label="Operations context">
              <AppointmentQueue
                title="Upcoming Appointments"
                tone="upcoming"
                appointments={visibleGroups.upcomingAppointments}
                emptyLabel={`No upcoming appointments are queued.${emptySuffix}`}
                layout="stack"
                displayLimit={8}
                onAppointmentCheckedIn={refresh}
                focusStaffId={focusStaffId}
              />

              <StaffSnapshot dashboard={dashboard} focusStaffId={focusStaffId} />

              <SectionShell title="Visit States" count={dashboard.visitsByState.length} tone="rail">
                {dashboard.visitsByState.length > 0 ? (
                  <div className="ops-state-list">
                    {dashboard.visitsByState.map((state) => (
                      <div key={state.state}>
                        <span>{enumLabel(state.state)}</span>
                        <strong>{state.count}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyQueue label="No open visit states in the current snapshot." />
                )}
              </SectionShell>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
