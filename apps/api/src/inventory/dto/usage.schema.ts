import { z } from 'zod';

const uuid = z.string().uuid();
const decimal = z.string().regex(/^\d+(\.\d{1,8})?$/);
const sourceType = z.enum([
  'MEDICATION',
  'VACCINE',
  'LAB_TEST',
  'PROCEDURE',
  'SURGERY',
  'TREATMENT',
  'RETAIL_SALE',
  'SERVICE',
  'BUNDLE',
  'OTHER',
]);
const eventType = z.enum([
  'MEDICATION_ADMINISTERED',
  'MEDICATION_WASTE',
  'PRESCRIPTION_DISPENSED',
  'VACCINE_ADMINISTERED',
  'LAB_TEST_STARTED',
  'LAB_TEST_COMPLETED',
  'PROCEDURE_COMPLETED',
  'SURGERY_COMPLETED',
  'TREATMENT_COMPLETED',
  'RETAIL_SALE_FINALIZED',
  'RETAIL_RETURN',
  'CLINICAL_REVERSAL',
  'FINANCIAL_REVERSAL',
  'MANUAL_USAGE',
]);
export const usageComponentSchema = z.object({
  itemId: uuid,
  quantityRule: z.enum([
    'FIXED',
    'PER_DOSE',
    'PER_UNIT',
    'PER_PATIENT_WEIGHT',
    'USER_CONFIRMED',
    'FORMULA',
  ]),
  fixedQuantity: decimal.optional().nullable(),
  quantityUnit: z.string().min(1),
  doseMultiplier: decimal.optional().nullable(),
  weightMultiplier: decimal.optional().nullable(),
  weightUnit: z.string().optional().nullable(),
  formulaConfiguration: z.record(z.unknown()).optional().nullable(),
  optional: z.boolean().default(false),
  staffConfirmationRequired: z.boolean().default(false),
  lotSelectionRequired: z.boolean().default(false),
  preferredStockLocationId: uuid.optional().nullable(),
  fallbackBehavior: z.enum(['NONE', 'LOCATION_PRIORITY', 'REQUIRE_CONFIRMATION']).default('NONE'),
  wasteAllowance: decimal.default('0'),
  substitutionGroup: z.string().optional().nullable(),
  physicalKit: z.boolean().default(false),
  deductComponents: z.boolean().default(true),
  sequence: z.number().int().min(0).default(0),
  notes: z.string().optional().nullable(),
});
export const usageMappingSchema = z.object({
  sourceType,
  sourceReference: z.string().min(1),
  sourceCatalogItemId: uuid.optional().nullable(),
  organizationWide: z.boolean().default(false),
  effectiveFrom: z.coerce.date().optional(),
  reservationBehavior: z
    .enum(['OFF', 'WHEN_ORDERED', 'WHEN_APPROVED', 'WHEN_PREPARED', 'MANUAL'])
    .default('OFF'),
  deductionEvent: eventType,
  lotSelectionPolicy: z.enum(['FEFO', 'FIFO', 'MANUAL', 'LOCATION_PRIORITY']).default('FEFO'),
  notes: z.string().optional().nullable(),
  activate: z.boolean().default(true),
  components: z.array(usageComponentSchema).min(1),
});
export const reservationSchema = z.object({
  itemId: uuid,
  lotId: uuid.optional().nullable(),
  controlledContainerId: uuid.optional().nullable(),
  stockLocationId: uuid,
  sourceEventType: eventType,
  sourceEventId: z.string().min(1),
  patientId: z.string().optional().nullable(),
  visitId: z.string().optional().nullable(),
  appointmentId: z.string().optional().nullable(),
  invoiceId: z.string().optional().nullable(),
  quantity: decimal,
  baseUnit: z.string().min(1),
  expiresAt: z.coerce.date().optional().nullable(),
  allowPartial: z.boolean().default(false),
  idempotencyKey: z.string().min(8),
});
export const releaseReservationSchema = z.object({
  reason: z.string().min(3),
  idempotencyKey: z.string().min(8),
});
export const usageLineConfirmationSchema = z.object({
  componentId: uuid.optional(),
  itemId: uuid,
  lotId: uuid.optional().nullable(),
  controlledContainerId: uuid.optional().nullable(),
  stockLocationId: uuid.optional().nullable(),
  confirmedQuantity: decimal.optional(),
  wastedQuantity: decimal.default('0'),
  reservationId: uuid.optional().nullable(),
  substitutionItemId: uuid.optional().nullable(),
  reason: z.string().optional().nullable(),
});
export const usagePostSchema = z.object({
  eventType,
  sourceRecordType: z.string().min(1),
  sourceRecordId: z.string().min(1),
  sourceEventVersion: z.number().int().positive().default(1),
  mappingId: uuid.optional(),
  sourceType: sourceType.optional(),
  sourceReference: z.string().optional(),
  patientId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  visitId: z.string().optional().nullable(),
  appointmentId: z.string().optional().nullable(),
  invoiceId: z.string().optional().nullable(),
  invoiceLineId: z.string().optional().nullable(),
  authorizingVeterinarianId: z.string().optional().nullable(),
  route: z.string().optional().nullable(),
  dose: decimal.optional(),
  units: decimal.optional(),
  patientWeight: decimal.optional(),
  occurredAt: z.coerce.date(),
  idempotencyKey: z.string().min(8),
  notes: z.string().optional().nullable(),
  lines: z.array(usageLineConfirmationSchema).default([]),
});
export const usageReversalSchema = z.object({
  sourceRecordId: z.string().min(1),
  disposition: z.enum([
    'RETURNED_NOT_RESTOCKABLE',
    'RETURNED_QUARANTINED',
    'RETURNED_TO_STOCK',
    'SENT_FOR_DISPOSAL',
    'FINANCIAL_ONLY',
  ]),
  reason: z.string().min(3),
  occurredAt: z.coerce.date(),
  idempotencyKey: z.string().min(8),
});
export const usageRetrySchema = z.object({
  idempotencyKey: z.string().min(8),
  lines: z.array(usageLineConfirmationSchema).default([]),
});

export type UsageMappingInput = z.infer<typeof usageMappingSchema>;
export type ReservationInput = z.infer<typeof reservationSchema>;
export type ReleaseReservationInput = z.infer<typeof releaseReservationSchema>;
export type UsagePostInput = z.infer<typeof usagePostSchema>;
export type UsageReversalInput = z.infer<typeof usageReversalSchema>;
export type UsageRetryInput = z.infer<typeof usageRetrySchema>;
