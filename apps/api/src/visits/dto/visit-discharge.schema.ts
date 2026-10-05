import { z } from 'zod';

const optionalText = z.string().trim().max(10000).optional().nullable();

const direction = z.string().trim().min(1).max(1000);
export const dischargeGuidanceSchema = z.object({
  visitSummary: optionalText,
  diet: optionalText,
  activity: optionalText,
  urgentSigns: optionalText,
  emergencyContact: z.string().trim().max(1000).optional().nullable(),
  recheckDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Enter a valid recheck date').optional().nullable(),
  medications: z.array(z.object({
    name: direction, dose: direction, route: direction, frequency: direction,
    duration: direction, nextDose: z.string().trim().max(1000).optional().nullable(),
    specialInstructions: optionalText,
  }).strict()).max(30).default([]),
}).strict();

export const saveVisitDischargeSchema = z.object({
  instructions: z.string().trim().min(1).max(10000),
  medicationInstructions: optionalText,
  clientGuidance: dischargeGuidanceSchema.optional(),
  warningSigns: optionalText,
  followUpPlan: optionalText,
  followUpRequired: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.followUpRequired && !value.followUpPlan) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['followUpPlan'], message: 'Describe the required follow-up plan' });
  }
});
export type SaveVisitDischargeInput = z.infer<typeof saveVisitDischargeSchema>;

export const completeVisitCheckoutSchema = z.object({
  clientContactConfirmed: z.boolean(),
  missingAccountInformation: optionalText,
  // Optional: when a real Invoice exists for the visit, VisitDischargeService
  // derives the balance from it and ignores/overrides these two fields —
  // the frontend cannot mark a visit paid on its own. They remain required
  // (enforced in the service, not here) only for the legacy self-reported
  // path used when no Invoice has been created for the visit.
  balanceDisposition: z.enum(['NoBalanceReported', 'OutstandingBalanceRecorded']).optional(),
  outstandingBalanceCents: z.number().int().nonnegative().optional().nullable(),
}).strict().superRefine((value, context) => {
  if (value.balanceDisposition === 'OutstandingBalanceRecorded' && !value.outstandingBalanceCents) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['outstandingBalanceCents'], message: 'Enter the outstanding balance' });
  }
  if (value.balanceDisposition === 'NoBalanceReported' && value.outstandingBalanceCents != null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['outstandingBalanceCents'], message: 'Do not enter an outstanding amount when no balance is reported' });
  }
});
export type CompleteVisitCheckoutInput = z.infer<typeof completeVisitCheckoutSchema>;

export const updateVisitBalanceSchema = z.object({ balanceDisposition: z.literal('NoBalanceReported'), note: z.string().trim().min(1).max(1000) }).strict();
export type UpdateVisitBalanceInput = z.infer<typeof updateVisitBalanceSchema>;
