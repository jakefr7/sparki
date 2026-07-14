import { z } from 'zod';

export const appointmentAvailabilitySchema = z
  .object({
    appointmentTypeId: z.string().min(1),
    providerId: z.string().min(1).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  })
  .refine((value) => value.endDate.getTime() - value.startDate.getTime() <= 31 * 24 * 60 * 60 * 1000, {
    message: 'Availability can be requested for at most 31 days at a time',
    path: ['endDate'],
  })
  .refine((value) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const limit = new Date(today); limit.setFullYear(limit.getFullYear() + 1);
    return value.startDate >= today && value.endDate <= new Date(limit.getTime() + 24 * 60 * 60 * 1000 - 1);
  }, { message: 'Dates must be between today and one year from today', path: ['startDate'] });

export type AppointmentAvailabilityInput = z.infer<typeof appointmentAvailabilitySchema>;
