import { z } from 'zod';

export const verifyEmailCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;
