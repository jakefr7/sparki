'use client';

import type { ReactNode } from 'react';
import { useNewAppointmentModal } from '../hooks/use-new-appointment-modal';

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
  const { openNewAppointment, newAppointmentModal } = useNewAppointmentModal(() => onCreated?.());

  return (
    <>
      <button
        type="button"
        className={className}
        data-tone={tone}
        onClick={() => openNewAppointment()}
      >
        {children}
      </button>
      {newAppointmentModal}
    </>
  );
}
