import { describe, expect, it } from 'vitest';
import { dateOfBirthSchema, isFutureDateOfBirth } from './date-of-birth.schema';

describe('Date of birth calendar rules', () => {
  it('rejects tomorrow in the clinic even when UTC has rolled over', () => {
    const now = new Date('2026-10-17T01:00:00Z'); // October 16 evening in Chicago
    expect(isFutureDateOfBirth(new Date('2026-10-17'), 'America/Chicago', now)).toBe(true);
    expect(isFutureDateOfBirth(new Date('2026-10-16'), 'America/Chicago', now)).toBe(false);
  });
  it('accepts today east of UTC without accepting tomorrow', () => {
    const now = new Date('2026-10-16T16:00:00Z'); // October 17 in Tokyo
    expect(isFutureDateOfBirth(new Date('2026-10-17'), 'Asia/Tokyo', now)).toBe(false);
    expect(isFutureDateOfBirth(new Date('2026-10-18'), 'Asia/Tokyo', now)).toBe(true);
  });
  it('normalizes timestamps to a UTC calendar date', () => {
    expect(dateOfBirthSchema.parse('2021-03-04T12:45:00Z').toISOString()).toBe(
      '2021-03-04T00:00:00.000Z',
    );
  });
});
