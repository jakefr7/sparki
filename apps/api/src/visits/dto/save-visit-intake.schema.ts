import { z } from 'zod';

const optionalText = z.string().trim().max(4000).optional().nullable();

export const saveVisitIntakeSchema = z.object({
  chiefComplaint: optionalText,
  historyNotes: optionalText,
  weight: z.number().positive().max(2000).optional().nullable(),
  temperature: z.number().positive().max(120).optional().nullable(),
  heartRate: z.number().int().positive().max(400).optional().nullable(),
  respiratoryRate: z.number().int().positive().max(200).optional().nullable(),
  crtSeconds: z.number().positive().max(30).optional().nullable(),
  appetite: z.string().trim().max(200).optional().nullable(),
  vomiting: z.boolean().optional(),
  diarrhea: z.boolean().optional(),
  medicationsAllergies: optionalText,
});

export type SaveVisitIntakeInput = z.infer<typeof saveVisitIntakeSchema>;
