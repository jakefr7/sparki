import { z } from 'zod';

export const createCheckoutSessionSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  priceId: z.string().trim().min(1),
});

export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;
