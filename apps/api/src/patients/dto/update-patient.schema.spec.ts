import { describe, expect, it } from 'vitest';
import { updatePatientSchema } from './update-patient.schema';

describe('updatePatientSchema', () => {
  it('accepts a partial update with a single field', () => {
    const result = updatePatientSchema.safeParse({ name: 'Biscuit' });
    expect(result.success).toBe(true);
  });

  it('accepts explicit null to clear a nullable field', () => {
    const result = updatePatientSchema.safeParse({ breed: null });
    expect(result.success).toBe(true);
  });

  it('rejects an empty body', () => {
    const result = updatePatientSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = updatePatientSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-date dateOfBirth', () => {
    const result = updatePatientSchema.safeParse({ dateOfBirth: 'not-a-date' });
    expect(result.success).toBe(false);
  });
});
