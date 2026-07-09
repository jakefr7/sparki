import { z } from 'zod';
import { AppointmentType } from '@sparki/db';

export const APPOINTMENT_COLOR_KEYS = [
  'teal',
  'blue',
  'purple',
  'amber',
  'orange',
  'green',
  'slate',
  'rose',
] as const;

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  // Omitted: defaults to the patient's primary Client (see AppointmentsService).
  clientId: z.string().min(1).optional(),
  appointmentType: z.nativeEnum(AppointmentType),
  visitReason: z.string().min(1).max(500),
  startTime: z.coerce.date(),
  expectedDurationMinutes: z.coerce
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
  assignedProviderId: z.string().min(1).optional(),
  colorKey: z.enum(APPOINTMENT_COLOR_KEYS).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const linkAppointmentPatientSchema = z.object({
  patientId: z.string().min(1),
  clientId: z.string().min(1).optional(),
});

export type LinkAppointmentPatientInput = z.infer<typeof linkAppointmentPatientSchema>;
