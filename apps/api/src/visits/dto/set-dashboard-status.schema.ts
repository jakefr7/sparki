import { z } from 'zod';

export const setDashboardStatusSchema = z.object({
  statusKey: z.string().min(1).optional(),
  status: z.enum(['Checked In', 'In Room', 'Ready for Checkout', 'Completed']).optional(),
}).refine((value) => value.statusKey || value.status, 'A target status is required').transform((value) => ({
  statusKey: value.statusKey ?? ({ 'Checked In': 'CheckIn', 'In Room': 'InRoom', 'Ready for Checkout': 'Discharge', Completed: 'Checkout' } as const)[value.status as NonNullable<typeof value.status>],
}));

export type SetDashboardStatusInput = z.infer<typeof setDashboardStatusSchema>;
