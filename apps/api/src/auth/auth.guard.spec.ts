import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './auth.guard';
import type { AuthService } from './auth.service';

function createContext(headers: Record<string, string> = {}): ExecutionContext {
  const request = { headers, user: undefined as unknown };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  it('allows public routes without a token', async () => {
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    const authService = { verifyToken: vi.fn() } as unknown as AuthService;
    const guard = new AuthGuard(reflector, authService);

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(authService.verifyToken).not.toHaveBeenCalled();
  });

  it('rejects protected routes with no bearer token', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const authService = { verifyToken: vi.fn() } as unknown as AuthService;
    const guard = new AuthGuard(reflector, authService);

    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verifies a bearer token and attaches the resolved user to the request', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const user = { id: 'user_1', email: 'vet@example.com' };
    const authService = { verifyToken: vi.fn().mockResolvedValue(user) } as unknown as AuthService;
    const guard = new AuthGuard(reflector, authService);
    const context = createContext({ authorization: 'Bearer test-token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.verifyToken).toHaveBeenCalledWith('test-token');
    expect(context.switchToHttp().getRequest<{ user?: unknown }>().user).toEqual(user);
  });
});
