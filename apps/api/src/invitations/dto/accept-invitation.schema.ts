import { z } from 'zod';

export const acceptInvitationSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  // WorkOS enforces a hard 10-character floor plus its own strength check
  // (see AuthService.ensureWorkosCredential) — this mirrors the floor so
  // obviously-too-short passwords are rejected before an external call.
  password: z.string().min(10).max(200),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
