import { describe, expect, it } from 'vitest';
import { createVisitWorkItemSchema, updateVisitWorkItemSchema } from './visit-work-item.schema';

describe('Phase 6 care-plan work item schemas', () => {
  it('accepts a structured medication recommendation', () => {
    expect(createVisitWorkItemSchema.safeParse({
      type: 'Medication',
      title: 'Amoxicillin',
      assigneeRole: 'TECHNICIAN',
      plan: { recommendation: 'Treat infection', medication: {
        orderedDose: '50 mg', route: 'PO', frequency: 'BID', duration: '7 days',
        disposition: 'DispensedTakeHome',
      } },
    }).success).toBe(true);
  });

  it.each(['Authorized', 'Declined', 'DecideLater'] as const)('accepts an attributed %s decision', (decision) => {
    expect(updateVisitWorkItemSchema.safeParse({
      status: decision === 'Declined' ? 'Declined' : decision === 'DecideLater' ? 'Deferred' : 'Pending',
      reason: `${decision} by client`,
      clientDecision: { decision, method: 'InPerson', note: null },
    }).success).toBe(true);
  });

  it('requires an execution outcome and timestamp', () => {
    expect(updateVisitWorkItemSchema.safeParse({ status: 'Completed', execution: { performedAt: new Date().toISOString() } }).success).toBe(false);
  });
});
