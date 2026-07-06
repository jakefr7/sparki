import { z } from 'zod';
import { VisitType } from '@sparki/db';

/**
 * Two entry paths share one schema (see VisitsService):
 * - From an Appointment: only appointmentId is required; patient, client,
 *   reason, and visit type all default from the Appointment unless
 *   overridden.
 * - Walk-in/manual: no appointmentId, so patientId and reason must be
 *   supplied directly (there's no Appointment to inherit them from).
 */
export const createVisitSchema = z
  .object({
    appointmentId: z.string().min(1).optional(),
    patientId: z.string().min(1).optional(),
    clientId: z.string().min(1).optional(),
    visitType: z.nativeEnum(VisitType).optional(),
    reason: z.string().min(1).max(500).optional(),
  })
  .refine((data) => Boolean(data.appointmentId) || Boolean(data.patientId), {
    message: 'Either appointmentId or patientId is required',
    path: ['patientId'],
  })
  .refine((data) => Boolean(data.appointmentId) || Boolean(data.reason), {
    message: 'reason is required when creating a Visit without an appointmentId',
    path: ['reason'],
  });

export type CreateVisitInput = z.infer<typeof createVisitSchema>;
