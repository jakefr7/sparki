import { z } from 'zod';

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex color');

export const upsertDashboardStatusColorSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional().nullable(),
  color: colorSchema,
  sortOrder: z.coerce.number().int().min(0).max(1000),
});

export type UpsertDashboardStatusColorInput = z.infer<typeof upsertDashboardStatusColorSchema>;
