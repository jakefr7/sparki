import { z } from 'zod';

const recordText = z.string().trim().max(20000).optional().nullable();

export const saveVisitRecordDraftSchema = z.object({
  subjective: recordText,
  objective: recordText,
  assessment: recordText,
  plan: recordText,
  version: z.number().int().positive(),
});
export type SaveVisitRecordDraftInput = z.infer<typeof saveVisitRecordDraftSchema>;

export const delegateVisitSignoffSchema = z.object({
  delegateId: z.string().min(1),
});
export type DelegateVisitSignoffInput = z.infer<typeof delegateVisitSignoffSchema>;

export const amendVisitRecordSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  subjective: recordText,
  objective: recordText,
  assessment: recordText,
  plan: recordText,
});
export type AmendVisitRecordInput = z.infer<typeof amendVisitRecordSchema>;
