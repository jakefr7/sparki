import { describe, expect, it } from 'vitest';
import { applyTenantScope, isTenantScopedModel } from './tenant-scoping';

const context = { organizationId: 'org_1' };

describe('isTenantScopedModel', () => {
  it('recognizes a model with an organizationId column', () => {
    expect(isTenantScopedModel('Client')).toBe(true);
    expect(isTenantScopedModel('Patient')).toBe(true);
  });

  it('rejects models without one, including the tenant root itself', () => {
    expect(isTenantScopedModel('Organization')).toBe(false);
    expect(isTenantScopedModel('NotARealModel')).toBe(false);
  });
});

describe('applyTenantScope', () => {
  it('passes args through untouched when there is no tenant context', () => {
    const args = { where: { id: '1' } };
    expect(applyTenantScope('Client', 'findMany', args, undefined)).toBe(args);
  });

  it('passes args through untouched for a model with no organizationId column', () => {
    const args = { where: { id: '1' } };
    expect(applyTenantScope('Organization', 'findMany', args, context)).toBe(args);
  });

  it('AND-merges organizationId into an existing findMany/findFirst/updateMany/deleteMany where', () => {
    for (const operation of ['findMany', 'findFirst', 'findFirstOrThrow', 'updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy']) {
      const result = applyTenantScope('Client', operation, { where: { isActive: true } }, context);
      expect(result).toEqual({ where: { AND: [{ isActive: true }, { organizationId: 'org_1' }] } });
    }
  });

  it('sets a bare organizationId where when the caller passed none', () => {
    const result = applyTenantScope('Client', 'findMany', {}, context);
    expect(result).toEqual({ where: { organizationId: 'org_1' } });
  });

  it('merges organizationId into the unique where for findUnique/update/delete', () => {
    for (const operation of ['findUnique', 'findUniqueOrThrow', 'update', 'delete']) {
      const result = applyTenantScope('Client', operation, { where: { id: 'c1' }, data: { name: 'x' } }, context);
      expect((result.where as Record<string, unknown>)).toEqual({ id: 'c1', organizationId: 'org_1' });
    }
  });

  it('scopes both the where and the create payload on upsert', () => {
    const result = applyTenantScope(
      'Client',
      'upsert',
      { where: { id: 'c1' }, create: { id: 'c1', firstName: 'A' }, update: { firstName: 'B' } },
      context,
    );
    expect(result.where).toEqual({ id: 'c1', organizationId: 'org_1' });
    expect(result.create).toEqual({ id: 'c1', firstName: 'A', organizationId: 'org_1' });
    expect(result.update).toEqual({ firstName: 'B' });
  });

  it('forces organizationId on create regardless of what the caller supplied', () => {
    const result = applyTenantScope('Client', 'create', { data: { firstName: 'A', organizationId: 'someone_else' } }, context);
    expect(result).toEqual({ data: { firstName: 'A', organizationId: 'org_1' } });
  });

  it('forces organizationId on every row of createMany', () => {
    const result = applyTenantScope(
      'Client',
      'createMany',
      { data: [{ firstName: 'A' }, { firstName: 'B', organizationId: 'someone_else' }] },
      context,
    );
    expect(result).toEqual({ data: [{ firstName: 'A', organizationId: 'org_1' }, { firstName: 'B', organizationId: 'org_1' }] });
  });

  it('leaves createMany untouched if data is not an array (defensive — should never happen)', () => {
    const args = { data: undefined };
    expect(applyTenantScope('Client', 'createMany', args, context)).toBe(args);
  });
});
