import { z } from 'zod';

const optionalText = z.string().trim().max(10000).optional().nullable();

export const saveVisitDischargeSchema = z.object({
  instructions: z.string().trim().min(1).max(10000),
  medicationInstructions: optionalText,
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
  balanceStatus: z.enum(['Paid', 'Outstanding']),
  outstandingBalanceCents: z.number().int().nonnegative().optional().nullable(),
}).superRefine((value, context) => {
  if (value.balanceStatus === 'Outstanding' && !value.outstandingBalanceCents) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['outstandingBalanceCents'], message: 'Enter the outstanding balance' });
  }
});
export type CompleteVisitCheckoutInput = z.infer<typeof completeVisitCheckoutSchema>;
