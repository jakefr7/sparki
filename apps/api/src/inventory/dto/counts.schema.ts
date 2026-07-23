import { z } from 'zod';
const decimal = z.string().regex(/^-?\d+(\.\d{1,8})?$/);
const countType = z.enum(['FULL', 'LOCATION', 'CATEGORY', 'CYCLE', 'LOT']);
export const countConfigurationSchema = z.object({
  stockLocationIds: z.array(z.string().uuid()).default([]),
  itemIds: z.array(z.string().uuid()).default([]),
  itemTypes: z.array(z.string()).default([]),
  routes: z.array(z.string()).default([]),
  therapeuticClasses: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  lotIds: z.array(z.string().uuid()).default([]),
  includeDescendants: z.boolean().default(true),
  includeZeroBalance: z.boolean().default(false),
  includeQuarantined: z.boolean().default(false),
});
export const createCountSchema = z.object({
  countType,
  templateId: z.string().uuid().optional().nullable(),
  configuration: countConfigurationSchema,
  blindCount: z.boolean().default(false),
  requireAllLines: z.boolean().default(true),
  requireRecount: z.boolean().default(true),
  varianceQuantityThreshold: decimal.optional().nullable(),
  variancePercentThreshold: decimal.optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  startImmediately: z.boolean().default(true),
});
export const countEntrySchema = z.object({
  quantity: decimal,
  method: z
    .enum(['MANUAL', 'BARCODE_SCAN', 'SKU_SEARCH', 'ITEM_SEARCH', 'IMPORT'])
    .default('MANUAL'),
  notes: z.string().max(2000).optional().nullable(),
  deviceMetadata: z.record(z.unknown()).optional(),
});
export const scannerQuerySchema = z.object({ query: z.string().trim().min(1).max(200) });
export const recountSchema = z.object({
  lineIds: z.array(z.string().uuid()).min(1),
  reason: z.string().trim().min(1).max(1000),
});
export const cancelCountSchema = z.object({ reason: z.string().trim().min(1).max(1000) });
export const postCountSchema = z.object({ idempotencyKey: z.string().min(8).max(200) });
export const assignmentSchema = z.object({
  assignedUserId: z.string(),
  stockLocationId: z.string().uuid().optional().nullable(),
});
export const reviewLineSchema = z.object({
  action: z.enum(['ACCEPT', 'EXCLUDE']),
  reason: z.string().max(1000).optional().nullable(),
});
export const templateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  countType,
  configuration: countConfigurationSchema,
  includeInactiveItems: z.boolean().default(false),
});
export type CreateCountInput = z.infer<typeof createCountSchema>;
export type CountEntryInput = z.infer<typeof countEntrySchema>;
export type RecountInput = z.infer<typeof recountSchema>;
export type CancelCountInput = z.infer<typeof cancelCountSchema>;
export type PostCountInput = z.infer<typeof postCountSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type CountTemplateInput = z.infer<typeof templateSchema>;
export type ReviewLineInput = z.infer<typeof reviewLineSchema>;
