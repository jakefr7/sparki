import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { BillingService } from './billing.service';
import { createCheckoutSessionSchema } from './dto/create-checkout-session.schema';

const config = { stripe: { priceStandard: 'price_approved' }, webOrigin: 'https://sparki.test' } as AppConfigService;

describe('clinic signup checkout', () => {
  it('validates the owner and practice details before creating a session', () => {
    expect(createCheckoutSessionSchema.safeParse({ email: 'owner@example.test', plan: 'STANDARD' }).success).toBe(false);
    expect(createCheckoutSessionSchema.safeParse({ email: 'owner@example.test', plan: 'STANDARD', ownerFirstName: 'Alex', ownerLastName: 'Owner', businessName: 'Maple Veterinary', teamSize: '1000' }).success).toBe(false);
  });

  it('uses the trusted price and carries signup details into Stripe metadata', async () => {
    const create = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
    const stripe = { checkout: { sessions: { create } } } as unknown as Stripe;
    const billing = new BillingService(config, stripe, {} as never, { assertReady: vi.fn().mockResolvedValue(undefined) } as never);
    const input = createCheckoutSessionSchema.parse({
      email: ' OWNER@EXAMPLE.TEST ', plan: 'STANDARD', ownerFirstName: ' Alex ', ownerLastName: 'Owner',
      businessName: ' Maple Veterinary ', businessPhone: '555-0100', teamSize: '6-10',
      addressLine1: '12 Maple Street', city: 'Madison', state: 'WI', postalCode: '53703',
      priceId: 'price_untrusted',
    });

    await expect(billing.createCheckoutSession(input)).resolves.toEqual({ checkoutUrl: 'https://checkout.stripe.test/session' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: 'price_approved', quantity: 1 }],
      customer_email: 'owner@example.test',
      metadata: expect.objectContaining({
        ownerEmail: 'owner@example.test', ownerFirstName: 'Alex', ownerLastName: 'Owner',
        businessName: 'Maple Veterinary', businessPhone: '555-0100', teamSize: '6-10',
        addressLine1: '12 Maple Street', city: 'Madison', state: 'WI', postalCode: '53703',
      }),
    }));
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('priceId');
  });

  it('does not open Stripe Checkout when activation email is unavailable', async () => {
    const create = vi.fn();
    const stripe = { checkout: { sessions: { create } } } as unknown as Stripe;
    const email = { assertReady: vi.fn().mockRejectedValue(new Error('Email unavailable')) };
    const billing = new BillingService(config, stripe, {} as never, email as never);
    const input = createCheckoutSessionSchema.parse({
      email: 'owner@example.test', plan: 'STANDARD', ownerFirstName: 'Alex', ownerLastName: 'Owner', businessName: 'Maple Veterinary',
    });
    await expect(billing.createCheckoutSession(input)).rejects.toThrow('Email unavailable');
    expect(create).not.toHaveBeenCalled();
  });
});
