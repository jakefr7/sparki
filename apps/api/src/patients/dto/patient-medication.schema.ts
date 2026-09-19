import { z } from 'zod';

export const patientMedicationStatuses = ['Active', 'Discontinued', 'Completed'] as const;

const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const optionalDate = z.preprocess(
  (value) => (value === '' ? null : value),
  z.coerce.date().nullable().optional(),
);

export const createPatientMedicationSchema = z.object({
  catalogItemId: z.string().uuid().optional().nullable(),
  medicationName: z.string().trim().min(1).max(200),
  genericName: optionalText(200),
  strength: optionalText(120),
  dose: optionalText(120),
  route: optionalText(80),
  frequency: optionalText(160),
  instructions: optionalText(1000),
  startDate: optionalDate,
  endDate: optionalDate,
  status: z.enum(patientMedicationStatuses).default('Active'),
  prescribedBy: optionalText(200),
  source: optionalText(120),
});

export const updatePatientMedicationSchema = createPatientMedicationSchema.partial();

export const discontinuePatientMedicationSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const flagMedicationReactionSchema = z.object({
  reaction: z.string().trim().min(1).max(2000),
});

export type CreatePatientMedicationInput = z.infer<typeof createPatientMedicationSchema>;
export type UpdatePatientMedicationInput = z.infer<typeof updatePatientMedicationSchema>;
export type DiscontinuePatientMedicationInput = z.infer<typeof discontinuePatientMedicationSchema>;
export type FlagMedicationReactionInput = z.infer<typeof flagMedicationReactionSchema>;
