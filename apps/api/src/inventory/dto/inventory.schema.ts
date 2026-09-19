import { z } from 'zod';

const decimal = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d{1,8})?$/, 'Use a decimal number with at most 8 decimal places');
const optionalDecimal = decimal.optional().nullable();

export const inventoryQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  view: z.string().trim().max(40).optional(),
  type: z.string().trim().optional(),
  status: z.string().trim().optional(),
  locationId: z.string().uuid().optional(),
});
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

export const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  primaryType: z.enum([
    'MEDICATION',
    'VACCINE',
    'DIAGNOSTIC',
    'SERVICE',
    'SUPPLY',
    'RETAIL',
    'FOOD',
    'OTHER',
  ]),
  route: z.string().trim().max(100).optional().nullable(),
  therapeuticClass: z.string().trim().max(120).optional().nullable(),
  species: z.array(z.string().trim().min(1).max(50)).default([]),
  tags: z.array(z.string().trim().min(1).max(50)).default([]),
  brand: z.string().trim().max(120).optional().nullable(),
  manufacturer: z.string().trim().max(120).optional().nullable(),
  strength: z.string().trim().max(120).optional().nullable(),
  form: z.string().trim().max(120).optional().nullable(),
  defaultFrequency: z.string().trim().max(160).optional().nullable(),
  sku: z.string().trim().max(80).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']).default('ACTIVE'),
  imageUrl: z.string().url().optional().nullable(),
  billable: z.boolean().default(false),
  inventoryTracked: z.boolean().default(false),
  taxable: z.boolean().default(false),
  retailPrice: optionalDecimal,
  markupPercent: optionalDecimal,
  internalNotes: z.string().trim().max(8000).optional().nullable(),
  lotTracking: z.boolean().default(false),
  expirationTracking: z.boolean().default(false),
  controlledSubstance: z.boolean().default(false),
  deaSchedule: z.string().trim().max(20).optional().nullable(),
  minimumStock: optionalDecimal,
  maximumStock: optionalDecimal,
  reorderPoint: optionalDecimal,
  reorderQuantity: optionalDecimal,
  barcodes: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(120),
        barcodeType: z.string().trim().min(1).max(40),
        unit: z.string().trim().max(40).optional().nullable(),
      }),
    )
    .default([]),
  conversion: z
    .object({
      purchaseUnit: z.string().trim().min(1),
      stockUnit: z.string().trim().min(1),
      dispenseUnit: z.string().trim().optional().nullable(),
      billingUnit: z.string().trim().optional().nullable(),
      purchaseToStock: decimal,
      stockToDispense: optionalDecimal,
      stockToBilling: optionalDecimal,
    })
    .optional()
    .nullable(),
});
export type ItemInput = z.infer<typeof itemSchema>;
export const updateItemSchema = itemSchema.partial();
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const adjustmentSchema = z
  .object({
    itemId: z.string().uuid(),
    stockLocationId: z.string().uuid(),
    lotId: z.string().uuid().optional().nullable(),
    lotNumber: z.string().trim().max(120).optional().nullable(),
    expirationDate: z.coerce.date().optional().nullable(),
    mode: z.enum(['DELTA', 'COUNTED']).default('DELTA'),
    quantity: decimal,
    reason: z.enum([
      'OPENING_BALANCE',
      'CORRECTION',
      'DAMAGED',
      'EXPIRED',
      'RETURNED',
      'INVENTORY_COUNT',
      'OTHER',
    ]),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.reason === 'OTHER' && !value.notes)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notes'],
        message: 'Notes are required when reason is OTHER',
      });
  });
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export const activityQuerySchema = z.object({
  itemId: z.string().uuid().optional(),
  type: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
