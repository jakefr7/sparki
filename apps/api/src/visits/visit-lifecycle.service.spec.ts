import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertVisitTransitionRequirements } from './visit-lifecycle.service';

const baseVisit = { visitType: 'Scheduled', intake: null, examFindings: null };

describe('visit lifecycle requirements', () => {
  it('blocks exam start with missing or unfinished intake', () => {
    expect(() => assertVisitTransitionRequirements(baseVisit, 'VeterinarianExamInProgress')).toThrow(ConflictException);
    expect(() => assertVisitTransitionRequirements({ ...baseVisit, intake: { completedAt: null } }, 'VeterinarianExamInProgress')).toThrow(ConflictException);
    expect(() => assertVisitTransitionRequirements({ ...baseVisit, intake: { completedAt: new Date() } }, 'VeterinarianExamInProgress')).not.toThrow();
  });
  it('requires completed intake before veterinarian handoff', () => {
    expect(() => assertVisitTransitionRequirements(baseVisit, 'VeterinarianExamReady')).toThrow(ConflictException);
    expect(() => assertVisitTransitionRequirements({ ...baseVisit, intake: { completedAt: new Date() } }, 'VeterinarianExamReady')).not.toThrow();
  });

  it('requires a completed exam before the veterinarian plan', () => {
    expect(() => assertVisitTransitionRequirements(baseVisit, 'PlanDrafted')).toThrow(ConflictException);
    expect(() => assertVisitTransitionRequirements({ ...baseVisit, examFindings: { completedAt: new Date() } }, 'PlanDrafted')).not.toThrow();
  });

  it('allows emergency stabilization before intake or exam is complete', () => {
    expect(() => assertVisitTransitionRequirements({ ...baseVisit, visitType: 'Emergency' }, 'TreatmentPending')).not.toThrow();
  });

  it('allows technician appointments to proceed without a veterinarian exam', () => {
    expect(() => assertVisitTransitionRequirements({ ...baseVisit, visitType: 'TechnicianAppointment' }, 'TreatmentPending')).not.toThrow();
  });

  it('requires discharge and checkout before record closure', () => {
    expect(() => assertVisitTransitionRequirements({ ...baseVisit, discharge: {}, checkout: null }, 'RecordCompletionPending')).toThrow(ConflictException);
    expect(() => assertVisitTransitionRequirements({ ...baseVisit, discharge: {}, checkout: {} }, 'RecordCompletionPending')).not.toThrow();
  });

  it('blocks discharge while required care or critical exceptions remain open', () => {
    const ready = { ...baseVisit, intake: { completedAt: new Date() }, examFindings: { completedAt: new Date() } };
    expect(() => assertVisitTransitionRequirements({ ...ready, workItems: [{ title: 'Administer medication' }] }, 'CheckoutReady')).toThrow(ConflictException);
    expect(() => assertVisitTransitionRequirements({ ...ready, exceptions: [{ type: 'EmergencyIntakeDeferred' }] }, 'CheckoutReady')).toThrow(ConflictException);
  });
});
