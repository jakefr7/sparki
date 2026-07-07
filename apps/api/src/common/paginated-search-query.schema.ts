import { z } from 'zod';

/** Shared shape for every "search this list" query param (patients, clients, ...). */
export const paginatedSearchQuerySchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PaginatedSearchQuery = z.infer<typeof paginatedSearchQuerySchema>;
