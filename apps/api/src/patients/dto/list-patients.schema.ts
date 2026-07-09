import { z } from 'zod';

export const listPatientsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;
