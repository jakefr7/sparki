import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertVisitTransitionRequirements } from './visit-lifecycle.service';

const complete = { completedAt: new Date() };

describe('visit discharge readiness', () => {
  it('allows a normal visit after intake and exam', () => {
    expect(() => assertVisitTransitionRequirements({ visitType: 'Scheduled', intake: complete, examFindings: complete, exceptions: [], workItems: [] }, 'CheckoutReady')).not.toThrow();
  });

  it('allows a technician appointment without a veterinarian exam', () => {
    expect(() => assertVisitTransitionRequirements({ visitType: 'TechnicianAppointment', intake: complete, examFindings: null, exceptions: [], workItems: [] }, 'CheckoutReady')).not.toThrow();
  });

  it('blocks discharge when intake is incomplete', () => {
    expect(() => assertVisitTransitionRequirements({ visitType: 'Scheduled', intake: null, examFindings: complete, exceptions: [], workItems: [] }, 'CheckoutReady')).toThrow(ConflictException);
  });

  it('blocks normal visits without a completed exam', () => {
    expect(() => assertVisitTransitionRequirements({ visitType: 'Scheduled', intake: complete, examFindings: null, exceptions: [], workItems: [] }, 'CheckoutReady')).toThrow(ConflictException);
  });

  it('blocks an unresolved emergency intake exception', () => {
    expect(() => assertVisitTransitionRequirements({
      visitType: 'Emergency',
      intake: complete,
      examFindings: complete,
      exceptions: [{ type: 'EmergencyIntakeDeferred' }],
      workItems: [],
    }, 'CheckoutReady')).toThrow(ConflictException);
  });

  it('blocks discharge preparation while required care remains open', () => {
    expect(() => assertVisitTransitionRequirements({
      visitType: 'Scheduled',
      intake: complete,
      examFindings: complete,
      exceptions: [],
      workItems: [{ title: 'Review diagnostic results' }],
    }, 'CheckoutReady')).toThrow(ConflictException);
  });
});
