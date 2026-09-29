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
  email: z.string().trim().toLowerCase().email(),
  plan: z.enum(SPARKI_PLANS),
});

export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;
