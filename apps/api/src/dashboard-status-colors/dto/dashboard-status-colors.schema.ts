import { z } from 'zod';
import { DashboardStatus } from '@sparki/db';

const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex color, for example #326FA8');

export const upsertDashboardStatusColorSchema = z.object({
  status: z.nativeEnum(DashboardStatus),
  color: colorSchema,
});

export type UpsertDashboardStatusColorInput = z.infer<typeof upsertDashboardStatusColorSchema>;
