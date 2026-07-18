import { z } from 'zod';

export const deferEmergencyIntakeSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type DeferEmergencyIntakeInput = z.infer<typeof deferEmergencyIntakeSchema>;
