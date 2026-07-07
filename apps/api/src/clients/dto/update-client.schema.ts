import { z } from 'zod';

export const updateClientSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().min(1).max(50).nullable().optional(),
    preferredContactMethod: z.string().min(1).max(50).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateClientInput = z.infer<typeof updateClientSchema>;
