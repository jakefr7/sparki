import Link from 'next/link';

export default function SchedulerPage() {
  return (
    <main className="page page--wide simple-hub">
      <Link href="/" className="back-link">
        Back to dashboard
      </Link>
      <header className="simple-hub__header">
        <p className="eyebrow">Scheduler</p>
        <h1>Scheduler</h1>
        <p>
          Appointment setting is intentionally scoped for a later phase. Use patient profiles to
          schedule a patient-specific appointment for now.
        </p>
      </header>
      <section className="home-widget">
        <h2>Next scheduling slice</h2>
        <p className="muted">
          Provider calendars, drag-and-drop rescheduling, waitlists, and schedule optimization are
          follow-up work and are not implemented in this slice.
        </p>
      </section>
    </main>
  );
}
