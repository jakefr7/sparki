'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { NewAppointmentModal } from './new-appointment-modal';
import type { StaffMember } from '../lib/patient-types';

export function NewAppointmentAction({
  children,
  className,
  tone,
  onCreated,
}: {
  children: ReactNode;
  className?: string | undefined;
  tone?: string | undefined;
  onCreated?: (() => void) | undefined;
}) {
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
      <button
        type="button"
        className={className}
        data-tone={tone}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open ? (
        <NewAppointmentModal
          providers={providers}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            onCreated?.();
          }}
        />
      ) : null}
    </>
  );
}
