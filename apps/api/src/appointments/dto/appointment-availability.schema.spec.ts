import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appointmentAvailabilitySchema } from './appointment-availability.schema';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function parse(startDate: string, endDate: string) {
  return appointmentAvailabilitySchema.safeParse({ appointmentTypeId: 'type-1', startDate, endDate });
}

describe('appointment availability date window', () => {
  const originalTimeZone = process.env.TZ;

  beforeEach(() => {
    // Staging runs in UTC while clinics and their browsers are in local time.
    process.env.TZ = 'UTC';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  it('accepts the clinic’s current day after the server has rolled over to the next UTC day', () => {
    // 7:01 PM on October 1 in Chicago; a UTC server is already on October 2.
    vi.setSystemTime(new Date('2026-10-02T00:01:00.000Z'));
    // The browser sends Chicago's local midnight for October 1 through October 7.
    expect(parse('2026-10-01T05:00:00.000Z', '2026-10-07T05:00:00.000Z').success).toBe(true);
  });

  it('accepts the last bookable day for a browser west of the server', () => {
    // 10 AM on October 1 in Chicago. The booking limit is the end of October 1 next year, Chicago time.
    vi.setSystemTime(new Date('2026-10-01T15:00:00.000Z'));
    expect(parse('2027-09-27T05:00:00.000Z', '2027-10-02T04:59:59.000Z').success).toBe(true);
  });

  it('rejects a range that starts before today in every time zone', () => {
    vi.setSystemTime(new Date('2026-10-02T00:01:00.000Z'));
    const start = new Date(Date.now() - 2 * DAY_MS);
    const end = new Date(start.getTime() + 6 * DAY_MS);
    expect(parse(start.toISOString(), end.toISOString()).success).toBe(false);
  });

  it('rejects a range that ends more than a year out', () => {
    vi.setSystemTime(new Date('2026-10-01T15:00:00.000Z'));
    expect(parse('2027-09-29T05:00:00.000Z', '2027-10-04T05:00:00.000Z').success).toBe(false);
  });
});
