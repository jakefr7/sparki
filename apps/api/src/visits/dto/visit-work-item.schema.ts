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
      ].includes(type),
    'This work item type is managed by another workflow action',
  );

export const createVisitWorkItemSchema = z.object({
  type: clinicalWorkType,
  title: z.string().trim().min(1).max(240),
  assigneeId: z.string().min(1).optional().nullable(),
  assigneeRole: z.nativeEnum(UserRole).optional().nullable(),
});
export type CreateVisitWorkItemInput = z.infer<typeof createVisitWorkItemSchema>;

export const updateVisitWorkItemSchema = z
  .object({
    status: z.nativeEnum(VisitWorkItemStatus),
    reason: z.string().trim().min(1).max(1000).optional().nullable(),
    inventoryUsage: usagePostSchema.optional(),
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
