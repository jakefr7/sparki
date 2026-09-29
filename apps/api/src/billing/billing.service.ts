import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import type Stripe from 'stripe';
import { AppConfigService } from '../config/app-config.service';
import { InvitationsService } from '../invitations/invitations.service';
import { EmailService } from '../email/email.service';
import { STRIPE_CLIENT } from './stripe-client.provider';
import { resolveStripePriceId } from './plans';
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
    private readonly invitations: InvitationsService,
    private readonly email: EmailService,
  ) {}

  get isConfigured(): boolean {
    return this.stripe !== null;
  }

  private requireConfigured(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        { code: 'BILLING_NOT_CONFIGURED', message: 'Checkout is temporarily unavailable.' },
      );
    }
    return this.stripe;
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ checkoutUrl: string }> {
    const stripe = this.requireConfigured();
    await this.email.assertReady();
    // The ONLY path from a client-supplied plan identifier to a Stripe
    // Price id — see docs/adr/ADR-008. `input` has no priceId field to
    // read even if a caller sent one.
    const priceId = resolveStripePriceId(this.config, input.plan);
    const signupMetadata = {
      ownerEmail: input.email,
      ownerFirstName: input.ownerFirstName,
      ownerLastName: input.ownerLastName,
      businessName: input.businessName,
      ...(input.businessPhone ? { businessPhone: input.businessPhone } : {}),
      ...(input.businessEmail ? { businessEmail: input.businessEmail } : {}),
      ...(input.teamSize ? { teamSize: input.teamSize } : {}),
      ...(input.addressLine1 ? { addressLine1: input.addressLine1 } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.state ? { state: input.state } : {}),
      ...(input.postalCode ? { postalCode: input.postalCode } : {}),
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: input.email,
      line_items: [{ price: priceId, quantity: 1 }],
      custom_text: {
        submit: { message: 'After checkout, we’ll email you a secure link to set up your clinic.' },
      },
      success_url: `${this.config.webOrigin}/setup/pending?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.config.webOrigin}/pricing`,
      // Stashed on both the session and the resulting subscription so the
      // webhook handler can recover the owner's email regardless of which
      // object it reads first / whether Stripe's own customer_details ever
      // populates for this session type.
      subscription_data: { metadata: { ownerEmail: input.email } },
      metadata: signupMetadata,
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
  async getCheckoutSessionStatus(sessionId: string): Promise<{ status: 'pending' | 'activation_required' | 'provisioned'; businessName: string | null }> {
    const stripe = this.requireConfigured();

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      throw new NotFoundException('Checkout session not found.');
    }

    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (customerId) {
      const organization = await prisma.organization.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true, name: true } });
      if (organization) {
        const invitation = await prisma.clinicInvitation.findFirst({
          where: { organizationId: organization.id, role: 'OWNER', invitedByUserId: null },
          select: { emailSentAt: true, status: true },
        });
        return {
          status: invitation?.emailSentAt || invitation?.status === 'ACCEPTED' ? 'provisioned' : 'activation_required',
          businessName: organization.name,
        };
      }
    }
    return { status: 'pending', businessName: session.metadata?.businessName?.trim() || null };
  }

  async resendActivation(sessionId: string): Promise<{ sent: true }> {
    const stripe = this.requireConfigured();
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      throw new NotFoundException('Checkout session not found.');
    }
    if (session.status !== 'complete') throw new ConflictException('Checkout is not complete.');

    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const ownerEmail = session.metadata?.ownerEmail ?? session.customer_email ?? session.customer_details?.email;
    if (!customerId || !ownerEmail) throw new NotFoundException('Owner activation not found.');
    const organization = await prisma.organization.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true, name: true } });
    if (!organization) throw new NotFoundException('Owner activation not found.');
    await this.invitations.resendOwnerActivation(organization.id, ownerEmail, organization.name);
    return { sent: true };
  }
}
