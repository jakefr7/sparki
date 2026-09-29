import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { isSparkiPlan, resolveStripePriceId, SPARKI_PLANS } from './plans';

function createConfig(priceStandard: string | undefined): AppConfigService {
  return {
    stripe: { secretKey: 'sk_test', webhookSecret: 'whsec_test', priceStandard },
  } as unknown as AppConfigService;
}

describe('SPARKI_PLANS / isSparkiPlan', () => {
  it('recognizes STANDARD as the only current plan', () => {
    expect(SPARKI_PLANS).toEqual(['STANDARD']);
    expect(isSparkiPlan('STANDARD')).toBe(true);
  });

  it('rejects an unknown plan identifier', () => {
    expect(isSparkiPlan('PRO')).toBe(false);
    expect(isSparkiPlan('')).toBe(false);
  });
});

describe('resolveStripePriceId', () => {
  it('resolves STANDARD to the configured Stripe Price id', () => {
    const config = createConfig('price_test_standard');
    expect(resolveStripePriceId(config, 'STANDARD')).toBe('price_test_standard');
  });

  it('fails clearly when the STANDARD plan has no configured Stripe price', () => {
    const config = createConfig(undefined);
    expect(() => resolveStripePriceId(config, 'STANDARD')).toThrow(ServiceUnavailableException);
    expect(() => resolveStripePriceId(config, 'STANDARD')).toThrow(/STRIPE_PRICE_STANDARD/);
  });
});
