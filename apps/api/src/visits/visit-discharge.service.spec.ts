import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertVisitReadyForDischarge } from './visit-discharge.service';

const complete = { completedAt: new Date() };

describe('visit discharge readiness', () => {
  it('allows a normal visit after intake and exam', () => {
    expect(() => assertVisitReadyForDischarge({ visitType: 'Scheduled', intake: complete, examFindings: complete, exceptions: [], workItems: [] })).not.toThrow();
  });

  it('allows a technician appointment without a veterinarian exam', () => {
    expect(() => assertVisitReadyForDischarge({ visitType: 'TechnicianAppointment', intake: complete, examFindings: null, exceptions: [], workItems: [] })).not.toThrow();
  });

  it('blocks discharge when intake is incomplete', () => {
    expect(() => assertVisitReadyForDischarge({ visitType: 'Scheduled', intake: null, examFindings: complete, exceptions: [], workItems: [] })).toThrow(ConflictException);
  });

  it('blocks normal visits without a completed exam', () => {
    expect(() => assertVisitReadyForDischarge({ visitType: 'Scheduled', intake: complete, examFindings: null, exceptions: [], workItems: [] })).toThrow(ConflictException);
  });

  it('blocks an unresolved emergency intake exception', () => {
    expect(() => assertVisitReadyForDischarge({
      visitType: 'Emergency',
      intake: complete,
      examFindings: complete,
      exceptions: [{ type: 'EmergencyIntakeDeferred' }],
      workItems: [],
    })).toThrow(ConflictException);
  });

  it('allows the client handoff to be prepared while care remains open', () => {
    expect(() => assertVisitReadyForDischarge({
      visitType: 'Scheduled',
      intake: complete,
      examFindings: complete,
      exceptions: [],
      workItems: [{ title: 'Review diagnostic results' }],
    })).not.toThrow();
  });
});
