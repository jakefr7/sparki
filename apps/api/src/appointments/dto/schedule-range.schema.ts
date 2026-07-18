import { z } from 'zod';

export const scheduleRangeSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine(({ startDate, endDate }) => endDate > startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  })
  .refine(
    ({ startDate, endDate }) => endDate.getTime() - startDate.getTime() <= 31 * 24 * 60 * 60 * 1000,
    { message: 'Schedule range cannot exceed 31 days', path: ['endDate'] },
  );

export type ScheduleRangeInput = z.infer<typeof scheduleRangeSchema>;
