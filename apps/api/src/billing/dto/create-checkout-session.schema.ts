import { z } from 'zod';
import { SPARKI_PLANS } from '../plans';

/**
 * No `priceId` field, deliberately (docs/adr/ADR-008): the browser names a
 * trusted Sparki plan, never a raw Stripe Price id. `z.enum` rejects an
 * unknown or missing `plan` with a normal 400 validation error, and
 * ZodValidationPipe's default (non-strict) parsing already drops any extra
 * client-supplied field such as `priceId`/`stripePriceId`/`customPrice` —
 * BillingService never sees or reads one either way.
 */
export const createCheckoutSessionSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  plan: z.enum(SPARKI_PLANS),
  ownerFirstName: z.string().trim().min(1).max(100),
  ownerLastName: z.string().trim().min(1).max(100),
  businessName: z.string().trim().min(1).max(200),
  businessPhone: z.string().trim().max(50).optional(),
  businessEmail: z.string().trim().max(200).refine((value) => !value || z.string().email().safeParse(value).success).optional(),
  teamSize: z.enum(['1', '2-5', '6-10', '11-25', '26+']).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
});

export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;
