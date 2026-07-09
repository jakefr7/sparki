import { z } from 'zod';

// min(3): don't call the provider for very short inputs (see AddressService).
export const addressAutocompleteQuerySchema = z.object({
  query: z.string().min(3).max(200),
  sessionToken: z.string().min(1).max(200),
});

export type AddressAutocompleteQuery = z.infer<typeof addressAutocompleteQuerySchema>;
