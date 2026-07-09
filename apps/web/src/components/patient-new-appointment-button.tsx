'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NewAppointmentModal } from './new-appointment-modal';
import type { PrimaryClientSummary, StaffMember } from '../lib/patient-types';

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
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<StaffMember[]>([]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch('/api/staff?canReceiveAppointments=true', { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<StaffMember[]>) : []))
      .then(setProviders)
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setProviders([]);
        }
      });
    return () => controller.abort();
  }, [open]);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? (
        <NewAppointmentModal
          initialPatient={{ ...patient, primaryClient }}
          providers={providers}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
