import { z } from 'zod';

export const setDashboardStatusSchema = z.object({
  status: z.enum(['Checked In', 'In Room', 'Ready for Checkout', 'Completed']),
});

export type SetDashboardStatusInput = z.infer<typeof setDashboardStatusSchema>;
