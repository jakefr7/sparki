import { z } from 'zod';

export const addressDetailsQuerySchema = z.object({
  placeId: z.string().min(1).max(300),
  sessionToken: z.string().min(1).max(200),
});

export type AddressDetailsQuery = z.infer<typeof addressDetailsQuerySchema>;
