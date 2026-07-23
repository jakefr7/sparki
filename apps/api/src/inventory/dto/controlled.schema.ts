import { z } from 'zod';
const decimal = z.string().regex(/^\d+(\.\d{1,8})?$/);
const id = z.string().uuid();
export const registrationSchema = z.object({
  type: z.enum(['DEA', 'STATE_CONTROLLED', 'STATE_DISPENSING', 'OTHER']),
  authority: z.string().min(1),
  registrationNumber: z.string().min(1),
  registrantUserId: z.string().optional().nullable(),
  registrantName: z.string().min(1),
  legalName: z.string().min(1),
  registeredAddress: z.string().min(1),
  effectiveDate: z.coerce.date(),
  expirationDate: z.coerce.date().optional().nullable(),
  schedules: z.array(z.string()).min(1),
  jurisdiction: z.string().optional().nullable(),
  policy: z.record(z.unknown()).optional(),
  notes: z.string().optional().nullable(),
});
export const authorizationSchema = z.object({
  userId: z.string(),
  authorizationTypes: z.array(z.string()).min(1),
  effectiveDate: z.coerce.date().default(() => new Date()),
  expirationDate: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export const profileSchema = z.object({
  registrationId: id,
  itemId: id,
  federalSchedule: z.string().min(1),
  stateSchedule: z.string().optional().nullable(),
  ndc: z.string().optional().nullable(),
  deaCode: z.string().optional().nullable(),
  dosageForm: z.string().min(1),
  strength: z.string().min(1),
  concentration: z.string().optional().nullable(),
  baseUnit: z.string().min(1),
  containerTracking: z.boolean().default(false),
  exactCountRequired: z.boolean().default(true),
  estimatedCountPermitted: z.boolean().default(false),
  openContainerTracking: z.boolean().default(false),
  secureStockLocationIds: z.array(id).min(1),
  administrationPrecision: z.number().int().min(0).max(8).default(3),
  dispensingPrecision: z.number().int().min(0).max(8).default(3),
  discrepancyThreshold: decimal.default('0'),
  witnessRules: z.record(z.unknown()).optional(),
  countFrequencyDays: z.number().int().positive().optional().nullable(),
  reportingConfiguration: z.record(z.unknown()).optional(),
});
export const controlledEventSchema = z.object({
  idempotencyKey: z.string().min(8),
  registrationId: id,
  profileId: id,
  containerId: id.optional().nullable(),
  lotId: id.optional().nullable(),
  stockLocationId: id,
  eventType: z.enum([
    'INITIAL_BALANCE',
    'RECEIVED',
    'ADMINISTERED',
    'DISPENSED',
    'WASTED_DURING_ADMINISTRATION',
    'ACCIDENTAL_LOSS',
    'DAMAGED',
    'EXPIRED',
    'RETURNED_TO_VENDOR',
    'RETURNED_TO_STOCK',
    'QUARANTINED',
    'RELEASED_FROM_QUARANTINE',
    'COUNT_ADJUSTMENT',
    'CORRECTION',
    'REVERSAL',
    'DISPOSAL_PENDING',
    'DISPOSED',
  ]),
  quantity: decimal,
  eventAt: z.coerce.date().default(() => new Date()),
  reason: z.string().min(1),
  patientId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  visitId: z.string().optional().nullable(),
  prescriptionReference: z.string().optional().nullable(),
  purchaseOrderId: z.string().optional().nullable(),
  receiptId: id.optional().nullable(),
  authorizingVeterinarianId: z.string().optional().nullable(),
  witnessId: z.string().optional().nullable(),
  externalReference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  attestation: z.string().min(5),
});
export const transferControlledSchema = z.object({
  idempotencyKey: z.string().min(8),
  registrationId: id,
  profileId: id,
  containerId: id.optional().nullable(),
  lotId: id.optional().nullable(),
  sourceStockLocationId: id,
  destinationStockLocationId: id,
  quantity: decimal,
  reason: z.string().min(1),
  witnessId: z.string().optional().nullable(),
  attestation: z.string().min(5),
});
export const discrepancySchema = z.object({
  registrationId: id,
  profileId: id.optional().nullable(),
  containerId: id.optional().nullable(),
  expectedQuantity: decimal.optional().nullable(),
  actualQuantity: decimal.optional().nullable(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  classification: z
    .enum([
      'DATA_ENTRY_ERROR',
      'TIMING_DIFFERENCE',
      'UNRECORDED_ADMINISTRATION',
      'UNRECORDED_WASTE',
      'RECEIVING_ERROR',
      'LOCATION_ERROR',
      'BREAKAGE_OR_SPILL',
      'THEFT_OR_SIGNIFICANT_LOSS_CONCERN',
      'UNKNOWN',
    ])
    .default('UNKNOWN'),
  investigationNotes: z.string().optional().nullable(),
});
export const reportStatusSchema = z.object({
  status: z.enum([
    'READY_FOR_REVIEW',
    'ACTION_REQUIRED',
    'EXPORTED',
    'FILED_EXTERNALLY',
    'ACCEPTED_EXTERNALLY',
    'REJECTED_EXTERNALLY',
    'CORRECTION_REQUIRED',
  ]),
  confirmationNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  attestation: z.string().min(5),
});
export type RegistrationInput = z.infer<typeof registrationSchema>;
export type AuthorizationInput = z.infer<typeof authorizationSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type ControlledEventInput = z.infer<typeof controlledEventSchema>;
export type ControlledTransferInput = z.infer<typeof transferControlledSchema>;
export type DiscrepancyInput = z.infer<typeof discrepancySchema>;
export type ReportStatusInput = z.infer<typeof reportStatusSchema>;
