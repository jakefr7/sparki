import { VisitPhase } from '@sparki/db';
import { z } from 'zod';

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex color');

export const upsertDashboardStatusColorSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional().nullable(),
  color: colorSchema,
  sortOrder: z.coerce.number().int().min(0).max(1000),
  isEnabled: z.boolean().default(true),
  isInClinic: z.boolean().default(false),
  allowedTransitionKeys: z.array(z.string().min(1)).default([]),
  lifecyclePhase: z.nativeEnum(VisitPhase).refine((phase) => phase !== 'Closed', 'Closed steps are controlled by visit completion, cancellation, or no-show actions').default('Arrived'),
});

export type UpsertDashboardStatusColorInput = z.infer<typeof upsertDashboardStatusColorSchema>;
