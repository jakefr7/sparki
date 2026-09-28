import type { SubscriptionStatus } from '@sparki/db';
import type Stripe from 'stripe';

/**
 * Maps a Stripe subscription status onto Sparki's own SubscriptionStatus.
 * Kept as one small pure function so the mapping policy lives in exactly one
 * place — see docs/adr/ADR-007 "Subscription Enforcement" for why each
 * value lands where it does.
 */
export function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'trialing':
    case 'active':
      return 'ACTIVE';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'canceled':
    case 'incomplete_expired':
      return 'CANCELED';
    case 'incomplete':
      return 'PENDING';
    case 'paused':
      // Stripe-initiated pause (e.g. a paused-collection billing pause) is
      // provider-driven, distinct from Sparki's own administrative
      // SUSPENDED — but the access consequence for the clinic is identical,
      // so it maps here rather than adding a case that behaves the same way.
      return 'SUSPENDED';
    default:
      return 'PENDING';
  }
}
