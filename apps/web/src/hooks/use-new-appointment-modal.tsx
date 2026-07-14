'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppointmentConfirmationModal, NewAppointmentModal, type AppointmentTypeSetting, type NewAppointmentCreatedSummary } from '../components/new-appointment-modal';
import type { AppointmentTypeValue, PrimaryClientSummary, StaffMember } from '../lib/patient-types';

export interface NewAppointmentInitialPatient {
  id: string;
  name: string;
  species: string;
  breed?: string | null;
  sex?: string | null;
  dateOfBirth?: string | null;
  weight?: number | null;
  color?: string | null;
  primaryClient: PrimaryClientSummary | null;
}

export interface NewAppointmentInitialContext {
  patient?: NewAppointmentInitialPatient | null;
  date?: string | Date | null;
  startTime?: string | Date | null;
  durationMinutes?: number | null;
  providerId?: string | null;
  locationId?: string | null;
  roomId?: string | null;
  appointmentTypeId?: AppointmentTypeValue | null;
  source?: string | null;
}

/** Single shared entry point for opening the New Appointment popup.
 *  Centralizes the provider fetch + open/context state so every call site
 *  (dashboard, today, patient profile, new-patient follow-up) renders the
 *  same modal instead of copying this bookkeeping. */
export function useNewAppointmentModal(onCreated?: (appointment: NewAppointmentCreatedSummary) => void) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<NewAppointmentInitialContext | null>(null);
  const [providers, setProviders] = useState<StaffMember[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentTypeSetting[]>([]);
  const [confirmedAppointment, setConfirmedAppointment] = useState<NewAppointmentCreatedSummary | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<NewAppointmentCreatedSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    Promise.all([
      fetch('/api/staff?canReceiveAppointments=true', { signal: controller.signal }),
      fetch('/api/scheduler-config', { signal: controller.signal, cache: 'no-store' }),
    ])
      .then(async ([staffResponse, configResponse]) => {
        setProviders(staffResponse.ok ? await staffResponse.json() as StaffMember[] : []);
        const config = configResponse.ok ? await configResponse.json() as { appointmentTypes: AppointmentTypeSetting[] } : null;
        setAppointmentTypes(config?.appointmentTypes ?? []);
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setProviders([]);
        }
      });
    return () => controller.abort();
  }, [open]);

  const openNewAppointment = useCallback((nextContext?: NewAppointmentInitialContext) => {
    setConfirmedAppointment(null);
    setEditingAppointment(null);
    setContext(nextContext ?? null);
    setOpen(true);
  }, []);

  const closeNewAppointment = useCallback(() => setOpen(false), []);

  const newAppointmentModal = open ? (
    <NewAppointmentModal
      initialPatient={context?.patient ?? null}
      initialDate={context?.date ?? null}
      initialStartTime={context?.startTime ?? null}
      initialDurationMinutes={context?.durationMinutes ?? null}
      initialProviderId={context?.providerId ?? null}
      initialAppointmentTypeId={context?.appointmentTypeId ?? null}
      editingAppointmentId={editingAppointment?.id ?? null}
      initialVisitReason={editingAppointment?.reason ?? null}
      providers={providers}
      appointmentTypes={appointmentTypes}
      onClose={closeNewAppointment}
      onCreated={(appointment) => {
        setOpen(false);
        setEditingAppointment(null);
        setConfirmedAppointment(appointment);
        onCreated?.(appointment);
      }}
    />
  ) : null;

  const appointmentConfirmationModal = confirmedAppointment ? (
    <AppointmentConfirmationModal
      appointment={confirmedAppointment}
      onClose={() => setConfirmedAppointment(null)}
      onEdit={() => {
        const appointment = confirmedAppointment;
        setConfirmedAppointment(null);
        setEditingAppointment(appointment);
        setContext({
          patient: appointment.patient ? {
            ...appointment.patient,
            primaryClient: appointment.client ? {
              ...appointment.client,
              phone: null,
              email: null,
              preferredContactMethod: null,
            } : null,
          } : null,
          date: appointment.scheduledAt,
          startTime: appointment.scheduledAt,
          durationMinutes: appointment.expectedDurationMinutes,
          providerId: appointment.provider?.id ?? null,
          appointmentTypeId: appointment.appointmentType,
        });
        setOpen(true);
      }}
    />
  ) : null;

  return { openNewAppointment, closeNewAppointment, newAppointmentModal: <>{newAppointmentModal}{appointmentConfirmationModal}</>, isNewAppointmentModalOpen: open };
}
