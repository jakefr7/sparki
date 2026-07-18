import { z } from 'zod';

const optionalText = z.string().trim().max(4000).optional().nullable();

export const saveVisitIntakeSchema = z.object({
  chiefComplaint: optionalText,
  historyNotes: optionalText,
  weight: z.number().positive().max(2000).optional().nullable(),
  weightUnit: z.enum(['LB', 'KG']).optional().nullable(),
  temperature: z.number().positive().max(120).optional().nullable(),
  heartRate: z.number().int().positive().max(400).optional().nullable(),
  respiratoryRate: z.number().int().positive().max(200).optional().nullable(),
  crtSeconds: z.number().positive().max(30).optional().nullable(),
  gumColor: z.string().trim().max(50).optional().nullable(),
  appetite: z.string().trim().max(200).optional().nullable(),
  vomiting: z.boolean().optional(),
  diarrhea: z.boolean().optional(),
  medicationsAllergies: optionalText,
  vaccinationHistory: optionalText,
  recentTravel: optionalText,
  specialDiet: optionalText,
  supplements: optionalText,
  attitude: z.string().trim().max(100).optional().nullable(),
  appearance: optionalText,
  allergies: optionalText,
  sedationIssues: optionalText,
  pastSurgeries: optionalText,
  currentMedications: optionalText,
  sneezing: z.boolean().optional(),
  systemicConcerns: optionalText,
  painScore: z.number().min(0).max(10).optional().nullable(),
  painScale: z.string().trim().max(100).optional().nullable(),
});

export type SaveVisitIntakeInput = z.infer<typeof saveVisitIntakeSchema>;
