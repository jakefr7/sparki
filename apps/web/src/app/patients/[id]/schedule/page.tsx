import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScheduleAppointmentForm } from '../../../../components/schedule-appointment-form';
import { env } from '../../../../lib/env';

async function getPatientName(id: string): Promise<string | null> {
  const response = await fetch(new URL(`/patients/${id}`, env.API_URL), { cache: 'no-store' });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load patient (${response.status})`);
  }
  const patient: { name: string } = await response.json();
  return patient.name;
}

export default async function ScheduleAppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const patientName = await getPatientName(id);
  if (!patientName) {
    notFound();
  }

  return (
    <main className="page">
      <Link href={`/patients/${id}`} className="back-link">
        ← Back to {patientName}
      </Link>
      <h1>Schedule Appointment</h1>
      <p className="patient-header__subtitle">for {patientName}</p>
      <ScheduleAppointmentForm patientId={id} />
    </main>
  );
}
