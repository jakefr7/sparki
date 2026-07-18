import { z } from 'zod';

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(50).nullable(),
  avatarUrl: z.string().trim().max(2000).refine((value) => value.startsWith('/') || URL.canParse(value), 'Invalid profile image URL').nullable(),
  statusEmoji: z.string().trim().max(16).nullable(),
  statusText: z.string().trim().max(120).nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
