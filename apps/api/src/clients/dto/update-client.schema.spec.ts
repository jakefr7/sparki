import { describe, expect, it } from 'vitest';
import { updateClientSchema } from './update-client.schema';

describe('updateClientSchema', () => {
  it('accepts a partial update with a single field', () => {
    const result = updateClientSchema.safeParse({ firstName: 'Jordan' });
    expect(result.success).toBe(true);
  });

  it('accepts explicit null to clear a nullable field', () => {
    const result = updateClientSchema.safeParse({ email: null });
    expect(result.success).toBe(true);
  });

  it('rejects an empty body', () => {
    const result = updateClientSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = updateClientSchema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty firstName', () => {
    const result = updateClientSchema.safeParse({ firstName: '' });
    expect(result.success).toBe(false);
  });
});
