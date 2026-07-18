import { describe, expect, it } from 'vitest';
import { deferEmergencyIntakeSchema } from './defer-emergency-intake.schema';
import { completeVisitCheckoutSchema, saveVisitDischargeSchema } from './visit-discharge.schema';

describe('visit lifecycle input contracts', () => {
  it('requires a reason when deferring emergency intake', () => {
    expect(deferEmergencyIntakeSchema.safeParse({ reason: 'Immediate stabilization required' }).success).toBe(true);
    expect(deferEmergencyIntakeSchema.safeParse({ reason: ' ' }).success).toBe(false);
  });

  it('requires a follow-up plan when follow-up is required', () => {
    expect(saveVisitDischargeSchema.safeParse({ instructions: 'Rest', followUpRequired: true }).success).toBe(false);
  });

  it('requires an amount for an outstanding balance', () => {
    expect(completeVisitCheckoutSchema.safeParse({ clientContactConfirmed: true, balanceStatus: 'Outstanding' }).success).toBe(false);
    expect(completeVisitCheckoutSchema.safeParse({ clientContactConfirmed: true, balanceStatus: 'Outstanding', outstandingBalanceCents: 2500 }).success).toBe(true);
  });
});
