'use client';

import { useRouter } from 'next/navigation';
import { useNewAppointmentModal } from '../hooks/use-new-appointment-modal';
import type { PrimaryClientSummary } from '../lib/patient-types';

export function PatientNewAppointmentButton({
  patient,
  primaryClient,
  className = 'button-secondary',
  label = 'New Appointment',
}: {
  patient: {
    id: string;
    name: string;
    species: string;
    breed: string | null;
    sex: string | null;
    dateOfBirth: string | null;
    weight: number | null;
    color: string | null;
  };
  primaryClient: PrimaryClientSummary | null;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const { openNewAppointment, newAppointmentModal } = useNewAppointmentModal(() => router.refresh());

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => openNewAppointment({ patient: { ...patient, primaryClient } })}
      >
        {label}
      </button>
      {newAppointmentModal}
    </>
  );
}
