import { describe, expect, it } from 'vitest';
import { cancelAppointmentSchema } from './create-appointment.schema';

describe('appointment lifecycle schemas', () => {
  it('requires a useful cancellation reason', () => {
    expect(cancelAppointmentSchema.safeParse({ reason: 'Client requested cancellation' }).success).toBe(true);
    expect(cancelAppointmentSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(cancelAppointmentSchema.safeParse({}).success).toBe(false);
  });
});
