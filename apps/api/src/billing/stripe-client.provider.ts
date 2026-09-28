import type { Provider } from '@nestjs/common';
import Stripe from 'stripe';
import { AppConfigService } from '../config/app-config.service';

/** Injection token for the shared Stripe client — BillingService and
 *  BillingWebhookService both need one, so it's constructed once here
 *  instead of each service privately instantiating its own. Also the seam
 *  billing.e2e-spec.ts overrides to stub the one call
 *  (`subscriptions.retrieve`) that would otherwise require live network
 *  access, while `webhooks.constructEvent` — the actual security boundary —
 *  keeps running for real against a genuine Stripe client. */
export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

export const stripeClientProvider: Provider = {
  provide: STRIPE_CLIENT,
  useFactory: (config: AppConfigService): Stripe | null => {
    const { secretKey } = config.stripe;
    return secretKey ? new Stripe(secretKey) : null;
  },
  inject: [AppConfigService],
};
