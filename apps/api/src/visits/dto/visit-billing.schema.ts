import { z } from 'zod';

// Money moves through this contract as integer cents (matches the existing
// VisitCheckout.outstandingBalanceCents convention), never floating-point
// dollars, so amount comparisons on the server can't drift from rounding.
const amountCents = z.number().int().positive().max(100_000_000);

export const addInvoiceLineSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    quantity: z
      .number()
      .positive()
      .max(100_000)
      .refine((value) => Number.isInteger(Math.round(value * 100)), 'Quantity supports at most 2 decimal places')
      .default(1),
    unitAmountCents: z.number().int().nonnegative().max(100_000_000),
    // Connects the charge to an existing billable item instead of
    // duplicating its name/price here. Ownership within the caller's
    // organization is verified server-side.
    catalogItemId: z.string().uuid().optional().nullable(),
    // Loose reference (e.g. a VisitWorkItem id) for a charge that comes from
    // something other than a CatalogItem. sourceType itself is derived
    // server-side from which of these is present, not accepted as input.
    sourceRecordId: z.string().trim().min(1).max(200).optional().nullable(),
  })
  .strict();
export type AddInvoiceLineInput = z.infer<typeof addInvoiceLineSchema>;

export const recordExternalPaymentSchema = z
  .object({
    amountCents,
    method: z.enum(['CASH', 'CARD', 'CHECK', 'OTHER']),
    note: z.string().trim().max(1000).optional().nullable(),
    externalReference: z.string().trim().max(200).optional().nullable(),
    // Required, like InventoryUsageEvent's idempotencyKey convention: the
    // client generates this once per submission attempt so a browser retry
    // replays the original payment instead of creating a second one.
    idempotencyKey: z.string().min(8).max(200),
    // Optional optimistic-concurrency check: pass the Invoice.version last
    // read to get a clear "stale financial state" error instead of racing
    // another writer (e.g. a second receptionist recording a payment at the
    // same time).
    expectedInvoiceVersion: z.number().int().positive().optional(),
  })
  .strict();
export type RecordExternalPaymentInput = z.infer<typeof recordExternalPaymentSchema>;

export const voidInvoiceSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;
