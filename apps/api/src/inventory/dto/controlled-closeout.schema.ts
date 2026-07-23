import { z } from 'zod';
const id = z.string().uuid(),
  decimal = z.string().regex(/^\d+(\.\d{1,8})?$/);
export const createControlledCountSchema = z.object({
  registrationId: id,
  type: z.enum([
    'INITIAL_INVENTORY',
    'PERIODIC_COUNT',
    'BIENNIAL_INVENTORY',
    'SPOT_CHECK',
    'SHIFT_COUNT',
    'DISCREPANCY_RECOUNT',
    'REGISTRATION_CLOSURE_COUNT',
  ]),
  timing: z.enum(['OPEN_OF_BUSINESS', 'CLOSE_OF_BUSINESS', 'DURING_BUSINESS', 'NOT_APPLICABLE']),
  blindCount: z.boolean().default(true),
  dualReviewRequired: z.boolean().default(true),
  notes: z.string().optional().nullable(),
});
export const controlledCountEntrySchema = z.object({
  quantity: decimal,
  exact: z.boolean(),
  sealedPackageCount: decimal.optional().nullable(),
  openedPackageCount: decimal.optional().nullable(),
  measuredQuantity: decimal.optional().nullable(),
  method: z.enum(['MANUAL', 'BARCODE_SCAN', 'SKU_SEARCH', 'ITEM_SEARCH']),
  notes: z.string().optional().nullable(),
  attestation: z.string().min(5),
});
export const controlledReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'RECOUNT', 'REJECT']),
  reason: z.string().optional().nullable(),
  idempotencyKey: z.string().min(8),
  attestation: z.string().min(5),
});
export const controlledPostSchema = z.object({
  idempotencyKey: z.string().min(8),
  attestation: z.string().min(5),
});
export const correctionSchema = z.object({
  originalEntryId: id,
  reason: z.enum([
    'WRONG_PATIENT',
    'WRONG_CLIENT',
    'WRONG_ITEM',
    'WRONG_LOT',
    'WRONG_CONTAINER',
    'WRONG_QUANTITY',
    'WRONG_UNIT',
    'WRONG_EVENT_TIME',
    'WRONG_PERFORMING_USER',
    'WRONG_PRESCRIBER',
    'WRONG_WITNESS',
    'DUPLICATE_ENTRY',
    'MISSING_WASTE',
    'OTHER',
  ]),
  explanation: z.string().min(3),
  proposedReplacement: z.record(z.unknown()).optional().nullable(),
  quantityImpact: z.string(),
  patientImpact: z.boolean().default(false),
  reportingImpact: z.boolean().default(false),
});
export const correctionDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().optional().nullable(),
  attestation: z.string().min(5),
});
export const disposalSchema = z.object({
  registrationId: id,
  profileId: id,
  itemId: id,
  lotId: id.optional().nullable(),
  containerId: id.optional().nullable(),
  stockLocationId: id,
  quantity: decimal,
  unit: z.string().min(1),
  reason: z.enum([
    'EXPIRED',
    'RECALLED',
    'DAMAGED',
    'CONTAMINATED',
    'UNUSABLE_REMAINDER',
    'REGISTRATION_CLOSURE',
    'INVENTORY_CLOSURE',
    'OTHER',
  ]),
  proposedMethod: z.string().min(1),
  authorizedParty: z.string().optional().nullable(),
  externalReference: z.string().optional().nullable(),
  scheduledAt: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export const disposalActionSchema = z.object({
  action: z.enum(['SUBMIT', 'APPROVE', 'REJECT', 'COMPLETE', 'CANCEL']),
  reason: z.string().optional().nullable(),
  witnessIds: z.array(z.string()).default([]),
  idempotencyKey: z.string().min(8),
  attestation: z.string().min(5),
});
export const revokeAuthorizationSchema = z.object({
  reason: z.string().min(3),
  attestation: z.string().min(5),
});
export const reportQuerySchema = z.object({
  registrationId: id,
  eventType: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
  reportType: z.string().default('CONTROLLED_RUNNING_BALANCE'),
});
export type CreateControlledCount = z.infer<typeof createControlledCountSchema>;
export type ControlledCountEntry = z.infer<typeof controlledCountEntrySchema>;
export type ControlledReview = z.infer<typeof controlledReviewSchema>;
export type ControlledPost = z.infer<typeof controlledPostSchema>;
export type CorrectionInput = z.infer<typeof correctionSchema>;
export type CorrectionDecision = z.infer<typeof correctionDecisionSchema>;
export type DisposalInput = z.infer<typeof disposalSchema>;
export type DisposalAction = z.infer<typeof disposalActionSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
