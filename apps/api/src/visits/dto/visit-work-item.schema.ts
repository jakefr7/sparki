import { UserRole, VisitWorkItemStatus, VisitWorkItemType } from '@sparki/db';
import { z } from 'zod';
import { usagePostSchema } from '../../inventory/dto/usage.schema';

const clinicalWorkType = z
  .nativeEnum(VisitWorkItemType)
  .refine(
    (type) =>
      [
        'Diagnostic',
        'Estimate',
        'ClientApproval',
        'Treatment',
        'Medication',
        'ClientCommunication',
        'FollowUp',
      ].includes(type),
    'This work item type is managed by another workflow action',
  );

export const createVisitWorkItemSchema = z.object({
  type: clinicalWorkType,
  title: z.string().trim().min(1).max(240),
  assigneeId: z.string().min(1).optional().nullable(),
  assigneeRole: z.nativeEnum(UserRole).optional().nullable(),
  plan: z.object({
    recommendation: z.string().trim().min(1).max(2000),
    medication: z.object({
      orderedDose: z.string().trim().min(1).max(120).optional(),
      route: z.string().trim().min(1).max(80).optional(),
      frequency: z.string().trim().min(1).max(120).optional(),
      duration: z.string().trim().min(1).max(120).optional(),
      disposition: z.enum(['AdministeredInClinic', 'DispensedTakeHome']).optional(),
    }).optional(),
  }).optional(),
});
export type CreateVisitWorkItemInput = z.infer<typeof createVisitWorkItemSchema>;

export const updateVisitWorkItemSchema = z
  .object({
    status: z.nativeEnum(VisitWorkItemStatus),
    reason: z.string().trim().min(1).max(1000).optional().nullable(),
    inventoryUsage: usagePostSchema.optional(),
    clientDecision: z.object({
      decision: z.enum(['Authorized', 'Declined', 'DecideLater']),
      method: z.enum(['InPerson', 'Phone', 'Video', 'Text', 'Email']),
      note: z.string().trim().max(1000).optional().nullable(),
    }).optional(),
    execution: z.object({
      outcome: z.string().trim().min(1).max(1000),
      actualDose: z.string().trim().max(120).optional().nullable(),
      concentration: z.string().trim().max(120).optional().nullable(),
      quantity: z.string().trim().max(120).optional().nullable(),
      unit: z.string().trim().max(40).optional().nullable(),
      route: z.string().trim().max(80).optional().nullable(),
      site: z.string().trim().max(80).optional().nullable(),
      performedAt: z.string().datetime(),
    }).optional(),
  })
  .superRefine((value, context) => {
    if (['Declined', 'Deferred', 'Cancelled'].includes(value.status) && !value.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A reason is required for this status',
      });
    }
  });
export type UpdateVisitWorkItemInput = z.infer<typeof updateVisitWorkItemSchema>;
