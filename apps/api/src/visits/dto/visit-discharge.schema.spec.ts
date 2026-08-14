import { describe, expect, it } from 'vitest';
import { completeVisitCheckoutSchema, updateVisitBalanceSchema } from './visit-discharge.schema';

describe('honest checkout balance dispositions', () => {
  it('records no reported balance without accepting payment claims', () => {
    expect(completeVisitCheckoutSchema.parse({ clientContactConfirmed: true, balanceDisposition: 'NoBalanceReported' }).balanceDisposition).toBe('NoBalanceReported');
    expect(() => completeVisitCheckoutSchema.parse({ clientContactConfirmed: true, balanceStatus: 'Paid' })).toThrow();
  });
  it('requires a positive amount for an outstanding balance observation', () => {
    expect(() => completeVisitCheckoutSchema.parse({ clientContactConfirmed: true, balanceDisposition: 'OutstandingBalanceRecorded', outstandingBalanceCents: 0 })).toThrow();
    expect(completeVisitCheckoutSchema.parse({ clientContactConfirmed: true, balanceDisposition: 'OutstandingBalanceRecorded', outstandingBalanceCents: 1250 }).outstandingBalanceCents).toBe(1250);
  });
  it('requires an audit note for a manual balance update', () => {
    expect(updateVisitBalanceSchema.parse({ balanceDisposition: 'NoBalanceReported', note: 'Confirmed in external terminal report' }).note).toContain('external');
    expect(() => updateVisitBalanceSchema.parse({ balanceDisposition: 'NoBalanceReported', note: '' })).toThrow();
  });
});
