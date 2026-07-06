import Link from 'next/link';
import { notFound } from 'next/navigation';
import { env } from '../../../lib/env';
import {
  appointmentTypeLabel,
  clientDisplayName,
  type VisitDetail,
} from '../../../lib/patient-types';

async function getVisit(id: string): Promise<VisitDetail | null> {
  const response = await fetch(new URL(`/visits/${id}`, env.API_URL), { cache: 'no-store' });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load visit (${response.status})`);
  }
  return response.json() as Promise<VisitDetail>;
}

export default async function VisitWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const visit = await getVisit(id);
  if (!visit) {
    notFound();
  }

  return (
    <main className="page">
      <Link href={`/patients/${visit.patient.id}`} className="back-link">
        ← Back to {visit.patient.name}
      </Link>

      <header className="patient-header">
        <h1>Visit Workspace</h1>
        <p className="patient-header__subtitle">
          {visit.patient.name} · {visit.patient.species}
          {visit.patient.breed ? ` · ${visit.patient.breed}` : ''}
        </p>
        <span className="patient-status">{visit.state}</span>
      </header>

      <section aria-labelledby="visit-summary-heading">
        <h2 id="visit-summary-heading">Visit Summary</h2>
        <div className="section-card section-card--available">
          <h3>{visit.reason}</h3>
          <p>Type: {visit.visitType}</p>
          <p>Started: {new Date(visit.createdAt).toLocaleString()}</p>
          <p>Client: {visit.client ? clientDisplayName(visit.client) : 'No client linked'}</p>
          {visit.appointment ? (
            <p>
              Appointment: {appointmentTypeLabel(visit.appointment.type)} ·{' '}
              {new Date(visit.appointment.scheduledAt).toLocaleString()}
            </p>
          ) : (
            <p>Appointment: Walk-in / no appointment</p>
          )}
        </div>
      </section>
    </main>
  );
}
