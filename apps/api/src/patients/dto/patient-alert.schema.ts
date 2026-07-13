import { z } from 'zod';

export const patientAlertCategories = [
  'Behavior',
  'Allergy',
  'Handling',
  'Medical',
  'BillingAdmin',
  'Other',
] as const;

export const patientAlertSeverities = ['Info', 'Caution', 'Critical'] as const;

export const createPatientAlertSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  category: z.enum(patientAlertCategories).default('Other'),
  severity: z.enum(patientAlertSeverities).default('Caution'),
});

export const updatePatientAlertSchema = createPatientAlertSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreatePatientAlertInput = z.infer<typeof createPatientAlertSchema>;
export type UpdatePatientAlertInput = z.infer<typeof updatePatientAlertSchema>;
