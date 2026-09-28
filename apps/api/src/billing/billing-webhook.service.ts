import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import type Stripe from 'stripe';
import { AppConfigService } from '../config/app-config.service';
import { logOrganizationEvent } from '../common/organization-event';
import { InvitationsService } from '../invitations/invitations.service';
import { STRIPE_CLIENT } from './stripe-client.provider';
import { mapStripeStatus } from './stripe-status';

/**
 * Verifies and processes Stripe webhook deliveries — the sole authoritative
 * path for clinic provisioning and subscription state changes (see
 * docs/adr/ADR-007). Idempotency strategy:
 *
 * 1. Every verified event is upserted into BillingWebhookEvent by Stripe's
 *    own event id before any handling runs. A row with `processedAt`
 *    already set means this exact event already completed successfully —
 *    return immediately, no-op. A row that exists but is NOT yet processed
 *    (new, or a previous attempt that failed) proceeds to (re)run its
 *    handler — every handler below is itself safe to run twice.
 * 2. `checkout.session.completed` is additionally idempotent on
 *    Organization.stripeCustomerId (unique): a retried delivery, or a
 *    second checkout attempt by an already-provisioned customer, resolves
 *    to the same Organization instead of creating a second one.
 * 3. Subscription-state handlers only apply an update whose Stripe `created`
 *    timestamp is at least as new as the last applied update
 *    (Organization.subscriptionStatusUpdatedAt), tolerating out-of-order
 *    delivery.
 */
@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger(BillingWebhookService.name);
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly config: AppConfigService,
    private readonly invitations: InvitationsService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
  ) {
    this.webhookSecret = this.config.stripe.webhookSecret;
  }

  async verifyAndProcess(rawBody: Buffer, signature: string | undefined): Promise<void> {
    if (!this.stripe || !this.webhookSecret) {
      throw new ServiceUnavailableException('Billing webhooks are not configured.');
    }
    if (!signature) {
      throw new BadRequestException('Missing Stripe-Signature header.');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      throw new BadRequestException(`Invalid webhook signature: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    const tracking = await prisma.billingWebhookEvent.upsert({
      where: { id: event.id },
      create: { id: event.id, type: event.type },
      update: {},
    });
    if (tracking.processedAt) {
      this.logger.log(`Ignoring already-processed webhook delivery ${event.id} (${event.type})`);
      return;
    }

    try {
      const organizationId = await this.handle(event);
      await prisma.billingWebhookEvent.update({
        where: { id: event.id },
        data: {
          processedAt: new Date(),
          error: null,
          ...(organizationId !== undefined ? { organizationId } : {}),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.billingWebhookEvent.update({ where: { id: event.id }, data: { error: message.slice(0, 500) } });
      throw error;
    }
  }

  /** Returns the affected Organization id, if any, for observability on the
   *  BillingWebhookEvent row. */
  private async handle(event: Stripe.Event): Promise<string | undefined> {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.handleCheckoutCompleted(event);
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return this.handleSubscriptionChanged(event);
      case 'invoice.payment_failed':
        return this.handlePaymentFailed(event);
      default:
        return undefined;
    }
  }

  private async handleCheckoutCompleted(event: Stripe.Event): Promise<string> {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    const ownerEmail = session.customer_details?.email ?? session.customer_email ?? session.metadata?.ownerEmail;

    if (!customerId || !subscriptionId || !ownerEmail) {
      throw new Error(
        `checkout.session.completed ${event.id} missing required fields (customer=${Boolean(customerId)}, subscription=${Boolean(subscriptionId)}, email=${Boolean(ownerEmail)})`,
      );
    }

    const existing = await prisma.organization.findUnique({ where: { stripeCustomerId: customerId } });
    if (existing) {
      return existing.id; // Already provisioned — duplicate delivery or a second checkout by the same customer.
    }

    const stripe = this.requireStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const status = mapStripeStatus(subscription.status);
    const priceId = subscription.items.data[0]?.price.id ?? null;

    const provisioned = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          // Placeholder — the owner sets the real name in /setup Step 1
          // (docs/adr/ADR-007 "Provisioning Flow"). Never blocks
          // provisioning on billing/checkout collecting a clinic name.
          name: 'New Clinic',
          subscriptionStatus: status,
          subscriptionStatusUpdatedAt: new Date(event.created * 1000),
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          subscriptionPriceId: priceId,
          subscriptionCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
        },
      });

      await tx.location.create({
        data: { organizationId: organization.id, name: 'Main Location' },
      });

      await logOrganizationEvent(tx, {
        organizationId: organization.id,
        actorUserId: null,
        type: 'CLINIC_PROVISIONED',
        metadata: { stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId },
      });

      const { rawToken } = await this.invitations.createOwnerInvitation(tx, organization.id, ownerEmail);

      return { organizationId: organization.id, rawToken };
    });

    await this.invitations.sendInvitationEmail({
      invitation: { email: ownerEmail.trim().toLowerCase(), role: 'OWNER', invitedByUserId: null },
      rawToken: provisioned.rawToken,
      clinicName: 'New Clinic',
    });

    return provisioned.organizationId;
  }

  private async handleSubscriptionChanged(event: Stripe.Event): Promise<string | undefined> {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

    const organization = await prisma.organization.findUnique({ where: { stripeCustomerId: customerId } });
    if (!organization) {
      // Out-of-order delivery: this subscription event arrived before
      // checkout.session.completed provisioned the Organization. Safe to
      // drop — that handler reads the subscription fresh from Stripe when
      // it runs, so no update is lost.
      return undefined;
    }

    const eventTime = new Date(event.created * 1000);
    if (organization.subscriptionStatusUpdatedAt && organization.subscriptionStatusUpdatedAt > eventTime) {
      return organization.id; // A newer event already applied — out-of-order guard.
    }

    const status = mapStripeStatus(subscription.status);
    const priceId = subscription.items.data[0]?.price.id ?? organization.subscriptionPriceId;

    await prisma.organization.update({
      where: { id: organization.id },
      data: {
        subscriptionStatus: status,
        subscriptionStatusUpdatedAt: eventTime,
        stripeSubscriptionId: subscription.id,
        subscriptionPriceId: priceId,
        subscriptionCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });

    if (status !== organization.subscriptionStatus) {
      await logOrganizationEvent(prisma, {
        organizationId: organization.id,
        actorUserId: null,
        type: 'SUBSCRIPTION_STATUS_CHANGED',
        metadata: { from: organization.subscriptionStatus, to: status, stripeEventType: event.type },
      });
    }

    return organization.id;
  }

  private async handlePaymentFailed(event: Stripe.Event): Promise<string | undefined> {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId) {
      return undefined;
    }

    const organization = await prisma.organization.findUnique({ where: { stripeCustomerId: customerId } });
    if (!organization) {
      return undefined;
    }

    const eventTime = new Date(event.created * 1000);
    if (organization.subscriptionStatusUpdatedAt && organization.subscriptionStatusUpdatedAt > eventTime) {
      return organization.id;
    }

    if (organization.subscriptionStatus === 'ACTIVE') {
      await prisma.organization.update({
        where: { id: organization.id },
        data: { subscriptionStatus: 'PAST_DUE', subscriptionStatusUpdatedAt: eventTime },
      });
      await logOrganizationEvent(prisma, {
        organizationId: organization.id,
        actorUserId: null,
        type: 'SUBSCRIPTION_STATUS_CHANGED',
        metadata: { from: 'ACTIVE', to: 'PAST_DUE', reason: 'invoice.payment_failed' },
      });
    }

    return organization.id;
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Billing is not configured.');
    }
    return this.stripe;
  }
}

