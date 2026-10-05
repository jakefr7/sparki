import { z } from 'zod';

export const createPatientFasSchema = z
  .object({
    requestId: z.string().uuid(),
    score: z.number().int().min(0).max(5),
    handlingNotes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();
export const listPatientFasSchema = z.object({ cursor: z.string().min(1).max(100).optional() });
export type CreatePatientFasInput = z.infer<typeof createPatientFasSchema>;
