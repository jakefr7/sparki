import { describe, expect, it } from 'vitest';
import { createPatientSchema } from './create-patient.schema';

const base = { name: 'Biscuit', species: 'Canine' };

describe('createPatientSchema', () => {
  it('accepts exactly one primary client', () => {
    const result = createPatientSchema.safeParse({
      ...base,
      clients: [
        { clientId: 'client_1', isPrimary: true },
        { clientId: 'client_2', isPrimary: false },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects zero primary clients', () => {
    const result = createPatientSchema.safeParse({
      ...base,
      clients: [{ clientId: 'client_1', isPrimary: false }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects more than one primary client', () => {
    const result = createPatientSchema.safeParse({
      ...base,
      clients: [
        { clientId: 'client_1', isPrimary: true },
        { clientId: 'client_2', isPrimary: true },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate clientId values', () => {
    const result = createPatientSchema.safeParse({
      ...base,
      clients: [
        { clientId: 'client_1', isPrimary: true },
        { clientId: 'client_1', isPrimary: false },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty clients array', () => {
    const result = createPatientSchema.safeParse({ ...base, clients: [] });
    expect(result.success).toBe(false);
  });

  it('accepts estimatedAge and imageUrl', () => {
    const result = createPatientSchema.safeParse({
      ...base,
      estimatedAge: '~3 years',
      imageUrl: 'https://example.com/pet.jpg',
      clients: [{ clientId: 'client_1', isPrimary: true }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-URL imageUrl', () => {
    const result = createPatientSchema.safeParse({
      ...base,
      imageUrl: 'not-a-url',
      clients: [{ clientId: 'client_1', isPrimary: true }],
    });
    expect(result.success).toBe(false);
  });
});
