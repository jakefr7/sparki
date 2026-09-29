import { ServiceUnavailableException } from '@nestjs/common';
import type { AppConfigService } from '../config/app-config.service';

/**
 * Every Sparki-sellable subscription plan (docs/adr/ADR-008). This is the
 * one trusted catalog of plan identifiers a browser is allowed to name —
 * never a raw Stripe Price id, which only this module ever resolves to.
 *
 * Adding a plan later is three small, additive steps: add the identifier
 * here, add one line to STRIPE_PRICE_ID_BY_PLAN below, and add the matching
 * STRIPE_PRICE_<PLAN> env var (see packages/config/src/env.ts and
 * AppConfigService.stripe) — no rewrite of checkout, webhook, or provisioning
 * logic.
 */
export const SPARKI_PLANS = ['STANDARD'] as const;
export type SparkiPlan = (typeof SPARKI_PLANS)[number];

export function isSparkiPlan(value: string): value is SparkiPlan {
  return (SPARKI_PLANS as readonly string[]).includes(value);
}

/**
 * The one function that turns a trusted Sparki plan identifier into an
 * approved Stripe Price id. BillingService.createCheckoutSession is the
 * only caller — a client-supplied Stripe Price id is never accepted, even
 * if a `plan` is also present (see CreateCheckoutSessionInput, which has no
 * priceId field at all).
 */
export function resolveStripePriceId(config: AppConfigService, plan: SparkiPlan): string {
  const priceIdByPlan: Record<SparkiPlan, string | undefined> = {
    STANDARD: config.stripe.priceStandard,
  };

  const priceId = priceIdByPlan[plan];
  if (!priceId) {
    throw new ServiceUnavailableException(
      `Billing is not configured for the ${plan} plan. Set STRIPE_PRICE_${plan} to enable checkout.`,
    );
  }
  return priceId;
}
