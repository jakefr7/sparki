import { z } from 'zod';
export const upsertDashboardStatusColorSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(240).optional().nullable(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex color'),
  })
  .strict();
export type UpsertDashboardStatusColorInput = z.infer<typeof upsertDashboardStatusColorSchema>;
