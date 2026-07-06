import { z } from 'zod';

export const searchClientsQuerySchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchClientsQuery = z.infer<typeof searchClientsQuerySchema>;
