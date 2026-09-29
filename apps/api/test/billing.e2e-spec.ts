import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import { json, raw } from 'express';
import request from 'supertest';
import type Stripe from 'stripe';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { STRIPE_CLIENT } from '../src/billing/stripe-client.provider';

/**
 * Exercises BillingWebhookService end to end against the real database and
 * a genuine Stripe client (real HMAC signature verification — see
 * STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET in .env, local placeholders only).
 * The one network-dependent Stripe call (`subscriptions.retrieve`) is
 * stubbed directly on the DI-constructed client; everything else —
 * signature verification, idempotency, provisioning, subscription-state
 * updates — runs for real.
 */
describe('Billing webhooks (e2e)', () => {
  let app: INestApplication;
  let stripe: Stripe;
  let sentEmails: { to: string; subject: string; text: string }[] = [];
  const webhookSecret = 'whsec_local_placeholder_not_a_real_secret';
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    const fakeEmail = {
      isConfigured: false,
      send: vi.fn(async (message: { to: string; subject: string; text: string }) => {
        sentEmails.push(message);
      }),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(fakeEmail)
      .compile();
    // Mirrors main.ts's bootstrap() exactly: the test harness never calls
    // main.ts, so its raw-body-for-webhooks wiring has to be reproduced here
    // or /billing/webhook would silently get Nest's default parsed-JSON body
    // instead of the raw bytes signature verification needs.
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.use('/billing/webhook', raw({ type: 'application/json' }));
    app.use(json({ limit: '35mb' }));
    await app.init();

    stripe = app.get(STRIPE_CLIENT);
  });

  afterEach(() => {
    sentEmails = [];
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.organizationEvent.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.clinicInvitation.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.location.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.billingWebhookEvent.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await app.close();
  });

  function signedPayload(event: unknown): { body: string; signature: string } {
    const body = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: webhookSecret });
    return { body, signature };
  }

  function postWebhook(body: string, signature: string) {
    // Sent as a plain string, deliberately NOT wrapped in a Buffer:
    // superagent's request._end() JSON.stringifies any non-string .send()
    // payload once Content-Type is "application/json" — including a Buffer,
    // which becomes `{"type":"Buffer","data":[...]}` instead of raw JSON
    // bytes. A string skips that re-serialization and is written verbatim,
    // which is what has to reach BillingWebhookService for the signature
    // (computed over these exact bytes above) to verify.
    return request(app.getHttpServer())
      .post('/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(body);
  }

  function checkoutCompletedEvent(params: { eventId: string; customerId: string; subscriptionId: string; email: string; created?: number }) {
    return {
      id: params.eventId,
      type: 'checkout.session.completed',
      created: params.created ?? Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_test_${params.eventId}`,
          customer: params.customerId,
          subscription: params.subscriptionId,
          customer_details: { email: params.email },
          customer_email: null,
          metadata: { ownerEmail: params.email },
        },
      },
    };
  }

  function subscriptionEvent(params: {
    eventId: string;
    type: 'customer.subscription.created' | 'customer.subscription.updated' | 'customer.subscription.deleted';
    customerId: string;
    subscriptionId: string;
    status: string;
    created?: number;
    currentPeriodEnd?: number;
  }) {
    return {
      id: params.eventId,
      type: params.type,
      created: params.created ?? Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: params.subscriptionId,
          customer: params.customerId,
          status: params.status,
          items: { data: [{ price: { id: 'price_test_standard' } }] },
          current_period_end: params.currentPeriodEnd ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
      },
    };
  }

  function stubSubscriptionRetrieve(status: Stripe.Subscription.Status, currentPeriodEnd?: number) {
    vi.spyOn(stripe.subscriptions, 'retrieve').mockResolvedValue({
      status,
      items: { data: [{ price: { id: 'price_test_standard' } }] },
      current_period_end: currentPeriodEnd ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    } as unknown as Stripe.Subscription);
  }

  describe('POST /billing/checkout-sessions (trusted plan catalog, ADR-008)', () => {
    it('resolves plan "STANDARD" to the configured STRIPE_PRICE_STANDARD Stripe price', async () => {
      const approvedPriceId = process.env.STRIPE_PRICE_STANDARD;
      expect(approvedPriceId).toBeTruthy();

      const createSpy = vi.spyOn(stripe.checkout.sessions, 'create').mockResolvedValue({
        url: 'https://checkout.stripe.test/session_fixture',
      } as unknown as Stripe.Checkout.Session);

      const response = await request(app.getHttpServer())
        .post('/billing/checkout-sessions')
        .send({ email: 'owner@example.test', plan: 'STANDARD' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ checkoutUrl: 'https://checkout.stripe.test/session_fixture' });
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: approvedPriceId, quantity: 1 }],
        }),
      );
    });

    it('ignores an arbitrary client-supplied priceId even when a valid plan is also sent', async () => {
      const approvedPriceId = process.env.STRIPE_PRICE_STANDARD;

      const createSpy = vi.spyOn(stripe.checkout.sessions, 'create').mockResolvedValue({
        url: 'https://checkout.stripe.test/session_fixture',
      } as unknown as Stripe.Checkout.Session);

      const response = await request(app.getHttpServer())
        .post('/billing/checkout-sessions')
        .send({ email: 'owner@example.test', plan: 'STANDARD', priceId: 'price_attacker_supplied', stripePriceId: 'price_attacker_supplied' });

      expect(response.status).toBe(201);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ line_items: [{ price: approvedPriceId, quantity: 1 }] }),
      );
    });

    it('rejects an unknown plan identifier', async () => {
      const response = await request(app.getHttpServer())
        .post('/billing/checkout-sessions')
        .send({ email: 'owner@example.test', plan: 'PRO' });
      expect(response.status).toBe(400);
    });

    it('rejects a missing plan', async () => {
      const response = await request(app.getHttpServer())
        .post('/billing/checkout-sessions')
        .send({ email: 'owner@example.test' });
      expect(response.status).toBe(400);
    });

    it('rejects a request that supplies only a raw priceId with no trusted plan', async () => {
      const response = await request(app.getHttpServer())
        .post('/billing/checkout-sessions')
        .send({ email: 'owner@example.test', priceId: 'price_attacker_supplied' });
      expect(response.status).toBe(400);
    });
  });

  it('rejects a webhook with an invalid signature', async () => {
    const response = await postWebhook(JSON.stringify({ id: 'evt_bad', type: 'checkout.session.completed' }), 'not-a-real-signature');
    expect(response.status).toBe(400);
  });

  it('provisions a new clinic from checkout.session.completed and emails the owner an activation link', async () => {
    stubSubscriptionRetrieve('active');
    const customerId = `cus_test_${Date.now()}_provision`;
    const subscriptionId = `sub_test_${Date.now()}_provision`;
    const email = `owner-${Date.now()}@example.test`;
    const event = checkoutCompletedEvent({ eventId: `evt_${Date.now()}_provision`, customerId, subscriptionId, email });
    const { body, signature } = signedPayload(event);

    const response = await postWebhook(body, signature);
    expect(response.status).toBe(201);

    const organization = await prisma.organization.findUniqueOrThrow({ where: { stripeCustomerId: customerId } });
    createdOrganizationIds.push(organization.id);

    expect(organization.subscriptionStatus).toBe('ACTIVE');
    expect(organization.stripeSubscriptionId).toBe(subscriptionId);

    const location = await prisma.location.findFirstOrThrow({ where: { organizationId: organization.id } });
    expect(location.name).toBe('Main Location');

    const invitation = await prisma.clinicInvitation.findFirstOrThrow({ where: { organizationId: organization.id } });
    expect(invitation.role).toBe('OWNER');
    expect(invitation.email).toBe(email);
    expect(invitation.invitedByUserId).toBeNull();

    const provisionedEvent = await prisma.organizationEvent.findFirstOrThrow({
      where: { organizationId: organization.id, type: 'CLINIC_PROVISIONED' },
    });
    expect(provisionedEvent.actorUserId).toBeNull();

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.to).toBe(email);
    expect(sentEmails[0]?.text).not.toContain(invitation.tokenHash);
  });

  it('does not create a duplicate clinic when the same webhook event is delivered twice', async () => {
    stubSubscriptionRetrieve('active');
    const customerId = `cus_test_${Date.now()}_dup`;
    const subscriptionId = `sub_test_${Date.now()}_dup`;
    const email = `owner-${Date.now()}-dup@example.test`;
    const event = checkoutCompletedEvent({ eventId: `evt_${Date.now()}_dup`, customerId, subscriptionId, email });
    const { body, signature } = signedPayload(event);

    const first = await postWebhook(body, signature);
    expect(first.status).toBe(201);
    const second = await postWebhook(body, signature);
    expect(second.status).toBe(201);

    const organizations = await prisma.organization.findMany({ where: { stripeCustomerId: customerId } });
    expect(organizations).toHaveLength(1);
    createdOrganizationIds.push(organizations[0]!.id);

    const invitations = await prisma.clinicInvitation.findMany({ where: { organizationId: organizations[0]!.id } });
    expect(invitations).toHaveLength(1);
    expect(sentEmails).toHaveLength(1);
  });

  it('provisions idempotently even when a retry arrives as a different Stripe event id for the same customer', async () => {
    stubSubscriptionRetrieve('active');
    const customerId = `cus_test_${Date.now()}_retry`;
    const subscriptionId = `sub_test_${Date.now()}_retry`;
    const email = `owner-${Date.now()}-retry@example.test`;

    const firstEvent = checkoutCompletedEvent({ eventId: `evt_${Date.now()}_retry_a`, customerId, subscriptionId, email });
    const secondEvent = checkoutCompletedEvent({ eventId: `evt_${Date.now()}_retry_b`, customerId, subscriptionId, email });

    const first = signedPayload(firstEvent);
    await postWebhook(first.body, first.signature);
    const second = signedPayload(secondEvent);
    const response = await postWebhook(second.body, second.signature);
    expect(response.status).toBe(201);

    const organizations = await prisma.organization.findMany({ where: { stripeCustomerId: customerId } });
    expect(organizations).toHaveLength(1);
    createdOrganizationIds.push(organizations[0]!.id);
  });

  it('updates subscription status from a customer.subscription.updated event', async () => {
    stubSubscriptionRetrieve('active');
    const customerId = `cus_test_${Date.now()}_status`;
    const subscriptionId = `sub_test_${Date.now()}_status`;
    const email = `owner-${Date.now()}-status@example.test`;

    const provision = signedPayload(checkoutCompletedEvent({ eventId: `evt_${Date.now()}_status_provision`, customerId, subscriptionId, email }));
    await postWebhook(provision.body, provision.signature);
    const organization = await prisma.organization.findUniqueOrThrow({ where: { stripeCustomerId: customerId } });
    createdOrganizationIds.push(organization.id);

    const pastDue = signedPayload(
      subscriptionEvent({
        eventId: `evt_${Date.now()}_status_pastdue`,
        type: 'customer.subscription.updated',
        customerId,
        subscriptionId,
        status: 'past_due',
        created: Math.floor(Date.now() / 1000) + 5,
      }),
    );
    const response = await postWebhook(pastDue.body, pastDue.signature);
    expect(response.status).toBe(201);

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(updated.subscriptionStatus).toBe('PAST_DUE');

    const changeEvent = await prisma.organizationEvent.findFirstOrThrow({
      where: { organizationId: organization.id, type: 'SUBSCRIPTION_STATUS_CHANGED' },
    });
    expect(changeEvent.metadata).toMatchObject({ from: 'ACTIVE', to: 'PAST_DUE' });
  });

  it('ignores an out-of-order subscription event older than the last applied update', async () => {
    stubSubscriptionRetrieve('active');
    const customerId = `cus_test_${Date.now()}_ooo`;
    const subscriptionId = `sub_test_${Date.now()}_ooo`;
    const email = `owner-${Date.now()}-ooo@example.test`;
    const now = Math.floor(Date.now() / 1000);

    const provision = signedPayload(checkoutCompletedEvent({ eventId: `evt_${Date.now()}_ooo_provision`, customerId, subscriptionId, email, created: now }));
    await postWebhook(provision.body, provision.signature);
    const organization = await prisma.organization.findUniqueOrThrow({ where: { stripeCustomerId: customerId } });
    createdOrganizationIds.push(organization.id);

    // A newer event (canceled) lands first...
    const newer = signedPayload(
      subscriptionEvent({ eventId: `evt_${Date.now()}_ooo_newer`, type: 'customer.subscription.updated', customerId, subscriptionId, status: 'canceled', created: now + 100 }),
    );
    await postWebhook(newer.body, newer.signature);

    // ...then an older, out-of-order event (past_due) arrives late and must not regress the status.
    const older = signedPayload(
      subscriptionEvent({ eventId: `evt_${Date.now()}_ooo_older`, type: 'customer.subscription.updated', customerId, subscriptionId, status: 'past_due', created: now + 10 }),
    );
    const response = await postWebhook(older.body, older.signature);
    expect(response.status).toBe(201);

    const finalState = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(finalState.subscriptionStatus).toBe('CANCELED');
  });
});
