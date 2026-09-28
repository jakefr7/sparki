import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import type Stripe from 'stripe';
import { AppConfigService } from '../config/app-config.service';
import { STRIPE_CLIENT } from './stripe-client.provider';
import type { CreateCheckoutSessionInput } from './dto/create-checkout-session.schema';

/**
 * Creates the hosted Stripe Checkout session that starts clinic
 * provisioning and lets the frontend poll for whether the (async, webhook-
 * driven) provisioning it triggers has completed. Never itself creates an
 * Organization — see docs/adr/ADR-007 "Do not rely on a client-side success
 * redirect as proof payment succeeded": only BillingWebhookService,
 * reacting to a signature-verified Stripe event, does that.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly config: AppConfigService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
  ) {}

  get isConfigured(): boolean {
    return this.stripe !== null;
  }

  private requireConfigured(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable checkout.',
      );
    }
    return this.stripe;
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ checkoutUrl: string }> {
    const stripe = this.requireConfigured();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: input.email,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: `${this.config.webOrigin}/setup/pending?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.config.webOrigin}/pricing`,
      // Stashed on both the session and the resulting subscription so the
      // webhook handler can recover the owner's email regardless of which
      // object it reads first / whether Stripe's own customer_details ever
      // populates for this session type.
      subscription_data: { metadata: { ownerEmail: input.email } },
      metadata: { ownerEmail: input.email },
    });

    if (!session.url) {
      throw new ServiceUnavailableException('Stripe did not return a checkout URL.');
    }
    return { checkoutUrl: session.url };
  }

  /**
   * Polled by the frontend's post-checkout landing page. Never proves
   * payment succeeded by itself — it only reports whether the webhook-driven
   * provisioning this session triggered has completed yet, which is why it
   * returns a coarse two-value status rather than raw Stripe session state.
   */
  async getCheckoutSessionStatus(sessionId: string): Promise<{ status: 'pending' | 'provisioned' }> {
    const stripe = this.requireConfigured();

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      throw new NotFoundException('Checkout session not found.');
    }

    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (customerId) {
      const organization = await prisma.organization.findUnique({ where: { stripeCustomerId: customerId } });
      if (organization) {
        return { status: 'provisioned' };
      }
    }
    return { status: 'pending' };
  }
}
