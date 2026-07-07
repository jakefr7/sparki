import { z } from 'zod';

const optionalText = z.string().trim().max(4000).optional().nullable();

export const saveExamFindingsSchema = z.object({
  subjective: optionalText,
  objective: optionalText,
  assessment: optionalText,
  plan: optionalText,
});

export type SaveExamFindingsInput = z.infer<typeof saveExamFindingsSchema>;
