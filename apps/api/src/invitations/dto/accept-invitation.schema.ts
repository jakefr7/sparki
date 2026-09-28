import { z } from 'zod';

export const acceptInvitationSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
