import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertVisitReadyForDischarge } from './visit-discharge.service';

const complete = { completedAt: new Date() };

describe('visit discharge readiness', () => {
  it('allows a normal visit after intake and exam', () => {
    expect(() => assertVisitReadyForDischarge({ visitType: 'Scheduled', intake: complete, examFindings: complete, exceptions: [] })).not.toThrow();
  });

  it('allows a technician appointment without a veterinarian exam', () => {
    expect(() => assertVisitReadyForDischarge({ visitType: 'TechnicianAppointment', intake: complete, examFindings: null, exceptions: [] })).not.toThrow();
  });

  it('blocks discharge when intake is incomplete', () => {
    expect(() => assertVisitReadyForDischarge({ visitType: 'Scheduled', intake: null, examFindings: complete, exceptions: [] })).toThrow(ConflictException);
  });

  it('blocks normal visits without a completed exam', () => {
    expect(() => assertVisitReadyForDischarge({ visitType: 'Scheduled', intake: complete, examFindings: null, exceptions: [] })).toThrow(ConflictException);
  });

  it('blocks an unresolved emergency intake exception', () => {
    expect(() => assertVisitReadyForDischarge({
      visitType: 'Emergency',
      intake: complete,
      examFindings: complete,
      exceptions: [{ type: 'EmergencyIntakeDeferred' }],
    })).toThrow(ConflictException);
  });
});
