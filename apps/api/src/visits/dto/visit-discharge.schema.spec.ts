import { describe, expect, it } from 'vitest';
import { completeVisitCheckoutSchema, updateVisitBalanceSchema, saveVisitDischargeSchema } from './visit-discharge.schema';

describe('honest checkout balance dispositions', () => {
  it('records no reported balance without accepting payment claims', () => {
    expect(completeVisitCheckoutSchema.parse({ clientContactConfirmed: true, balanceDisposition: 'NoBalanceReported' }).balanceDisposition).toBe('NoBalanceReported');
    expect(() => completeVisitCheckoutSchema.parse({ clientContactConfirmed: true, balanceStatus: 'Paid' })).toThrow();
    expect(() => completeVisitCheckoutSchema.parse({ clientContactConfirmed: true, balanceDisposition: 'NoBalanceReported', balanceStatus: 'Paid' })).toThrow();
    expect(() => completeVisitCheckoutSchema.parse({ clientContactConfirmed: true, balanceDisposition: 'NoBalanceReported', outstandingBalanceCents: 1250 })).toThrow();
  });
  it('requires a positive amount for an outstanding balance observation', () => {
    expect(() => completeVisitCheckoutSchema.parse({ clientContactConfirmed: true, balanceDisposition: 'OutstandingBalanceRecorded', outstandingBalanceCents: 0 })).toThrow();
    expect(completeVisitCheckoutSchema.parse({ clientContactConfirmed: true, balanceDisposition: 'OutstandingBalanceRecorded', outstandingBalanceCents: 1250 }).outstandingBalanceCents).toBe(1250);
  });
  it('requires an audit note for a manual balance update', () => {
    expect(updateVisitBalanceSchema.parse({ balanceDisposition: 'NoBalanceReported', note: 'Confirmed in external terminal report' }).note).toContain('external');
    expect(() => updateVisitBalanceSchema.parse({ balanceDisposition: 'NoBalanceReported', note: '' })).toThrow();
    expect(() => updateVisitBalanceSchema.parse({ balanceDisposition: 'NoBalanceReported', note: 'External report', paymentReference: 'claim' })).toThrow();
  });
});

describe('reviewed client discharge guidance', () => {
  const medication = { name: 'Synthetic medication', dose: 'Staff-entered dose', route: 'Staff-entered route', frequency: 'Staff-entered frequency', duration: 'Staff-entered duration' };
  it('accepts older discharge payloads without inventing structured guidance', () => {
    expect(saveVisitDischargeSchema.parse({ instructions: 'Reviewed guidance' }).clientGuidance).toBeUndefined();
  });
  it('requires complete directions for each medication and rejects extra claims', () => {
    expect(() => saveVisitDischargeSchema.parse({ instructions: 'Reviewed', clientGuidance: { medications: [{ ...medication, dose: ' ' }] } })).toThrow();
    expect(() => saveVisitDischargeSchema.parse({ instructions: 'Reviewed', clientGuidance: { medications: [{ ...medication, authorized: true }] } })).toThrow();
    expect(saveVisitDischargeSchema.parse({ instructions: 'Reviewed', clientGuidance: { medications: [medication] } }).clientGuidance?.medications[0]).toEqual(medication);
  });
  it('validates real calendar dates without shifting the clinic date', () => {
    for (const recheckDate of ['2026-02-30', '2026-13-01', 'not-a-date']) expect(() => saveVisitDischargeSchema.parse({ instructions: 'Reviewed', clientGuidance: { recheckDate } })).toThrow();
    expect(saveVisitDischargeSchema.parse({ instructions: 'Reviewed', clientGuidance: { recheckDate: '2028-02-29' } }).clientGuidance?.recheckDate).toBe('2028-02-29');
  });
});
