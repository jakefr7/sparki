import { z } from 'zod';

export const createClientSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().min(1).max(50).optional(),
  preferredContactMethod: z.string().min(1).max(50).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
