import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { AuthGuard } from './auth.guard';
import type { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME } from './session-cookie';

function createContext(cookie?: string): ExecutionContext {
  const request = { headers: cookie ? { cookie } : {}, user: undefined as unknown };
  const response = { cookie: vi.fn() };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function createConfig(): AppConfigService {
  return { nodeEnv: 'test' } as unknown as AppConfigService;
}

describe('AuthGuard', () => {
  it('allows public routes without a session cookie', async () => {
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    const authService = { verifySession: vi.fn() } as unknown as AuthService;
    const guard = new AuthGuard(reflector, authService, createConfig());

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(authService.verifySession).not.toHaveBeenCalled();
  });

  it('rejects protected routes with no session cookie', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const authService = { verifySession: vi.fn() } as unknown as AuthService;
    const guard = new AuthGuard(reflector, authService, createConfig());

    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verifies the session cookie and attaches the resolved user to the request', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const user = { id: 'user_1', email: 'vet@example.com' };
    const authService = {
      verifySession: vi.fn().mockResolvedValue({ user }),
    } as unknown as AuthService;
    const guard = new AuthGuard(reflector, authService, createConfig());
    const context = createContext(`${SESSION_COOKIE_NAME}=sealed-session-value`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.verifySession).toHaveBeenCalledWith('sealed-session-value');
    expect(context.switchToHttp().getRequest<{ user?: unknown }>().user).toEqual(user);
  });

  it('re-issues the session cookie when verifySession refreshes an expired access token', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const user = { id: 'user_1', email: 'vet@example.com' };
    const authService = {
      verifySession: vi
        .fn()
        .mockResolvedValue({ user, refreshedSealedSession: 'new-sealed-session' }),
    } as unknown as AuthService;
    const guard = new AuthGuard(reflector, authService, createConfig());
    const context = createContext(`${SESSION_COOKIE_NAME}=sealed-session-value`);

    await guard.canActivate(context);

    expect(
      context.switchToHttp().getResponse<{ cookie: ReturnType<typeof vi.fn> }>().cookie,
    ).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      'new-sealed-session',
      expect.objectContaining({ httpOnly: true }),
    );
  });
});
