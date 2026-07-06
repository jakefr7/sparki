import { z } from 'zod';
import { AppointmentType } from '@sparki/db';

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
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
