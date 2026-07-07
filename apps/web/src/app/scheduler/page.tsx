import { DashboardCard, DashboardShell } from '../../components/dashboard-shell';

export default function SchedulerPage() {
  return (
    <DashboardShell
      activeHref="/scheduler"
      eyebrow="Scheduler"
      title="Scheduler"
      subtitle="Appointment setting is intentionally scoped for a later phase. Use patient profiles to schedule a patient-specific appointment for now."
    >
      <div className="simple-hub">
        <DashboardCard>
          <h2>Next scheduling slice</h2>
          <p className="muted">
            Provider calendars, drag-and-drop rescheduling, waitlists, and schedule optimization are
            follow-up work and are not implemented in this slice.
          </p>
        </DashboardCard>
      </div>
    </DashboardShell>
  );
}
