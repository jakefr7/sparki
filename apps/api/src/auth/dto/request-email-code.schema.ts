import { z } from 'zod';

export const requestEmailCodeSchema = z.object({
  email: z.string().email(),
});

export type RequestEmailCodeInput = z.infer<typeof requestEmailCodeSchema>;
