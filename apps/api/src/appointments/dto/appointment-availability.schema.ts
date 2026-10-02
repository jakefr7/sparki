import { z } from 'zod';

// The browser sends day boundaries in its own time zone, which need not match the server's
// (staging runs in UTC). "Today" began at most a local day ago wherever the browser is, so bound
// the window by instants with that much slack instead of by the server's calendar day: 25 hours
// for a day that includes a DST change, plus an hour for DST differences between the two zones.
const DAY_BOUNDARY_TOLERANCE_MS = 26 * 60 * 60 * 1000;

export const appointmentAvailabilitySchema = z
  .object({
    appointmentTypeId: z.string().min(1),
    providerId: z.string().min(1).optional(),
    excludeAppointmentId: z.string().min(1).optional(),
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
    const now = new Date();
    const limit = new Date(now); limit.setFullYear(limit.getFullYear() + 1);
    return value.startDate.getTime() >= now.getTime() - DAY_BOUNDARY_TOLERANCE_MS
      && value.endDate.getTime() <= limit.getTime() + DAY_BOUNDARY_TOLERANCE_MS;
  }, { message: 'Dates must be between today and one year from today', path: ['startDate'] });

export type AppointmentAvailabilityInput = z.infer<typeof appointmentAvailabilitySchema>;
