import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enterTenantContext } from '@sparki/db';
import { TenantContextGuard } from './tenant-context.guard';
import type { AuthenticatedUser } from './types';

vi.mock('@sparki/db', () => ({ enterTenantContext: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

function createContext(user?: AuthenticatedUser): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TenantContextGuard', () => {
  it('enters a tenant context for an authenticated request', () => {
    const user = { organizationId: 'org_1' } as AuthenticatedUser;
    const guard = new TenantContextGuard();

    expect(guard.canActivate(createContext(user))).toBe(true);
    expect(enterTenantContext).toHaveBeenCalledWith({ organizationId: 'org_1' });
  });

  it('does nothing for a request with no resolved user, rather than guessing a tenant', () => {
    const guard = new TenantContextGuard();

    expect(guard.canActivate(createContext(undefined))).toBe(true);
    expect(enterTenantContext).not.toHaveBeenCalled();
  });
});
