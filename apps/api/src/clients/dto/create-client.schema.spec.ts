import { describe, expect, it } from 'vitest';
import { createClientSchema } from './create-client.schema';

const base = { firstName: 'Jordan', lastName: 'Lee' };

describe('createClientSchema', () => {
  it('accepts the minimal required fields', () => {
    const result = createClientSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('accepts alternatePhone and a structured address', () => {
    const result = createClientSchema.safeParse({
      ...base,
      phone: '555-0100',
      alternatePhone: '555-0199',
      addressLine1: '123 Main St',
      addressLine2: 'Apt 4',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62704',
      country: 'US',
      formattedAddress: '123 Main St, Apt 4, Springfield, IL 62704',
      addressPlaceId: 'place.123',
      addressLatitude: 39.78,
      addressLongitude: -89.65,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = createClientSchema.safeParse({ ...base, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    const result = createClientSchema.safeParse({ ...base, addressLatitude: 200 });
    expect(result.success).toBe(false);
  });
});
