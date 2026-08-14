import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import type { AuthService } from './auth.service';
import { DevelopmentAuthGuard } from './development-auth.guard';
import type { DevelopmentUserService } from './development-user.service';
import { SESSION_COOKIE_NAME } from './session-cookie';

function createContext(cookie?: string): ExecutionContext {
  const request = { headers: cookie ? { cookie } : {}, user: undefined as unknown };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function createConfig(nodeEnv: 'development' | 'test' | 'production'): AppConfigService {
  return { nodeEnv, developmentAuthMode: 'fixed' } as unknown as AppConfigService;
}

function createAuthService(): AuthService {
  return { verifySession: vi.fn() } as unknown as AuthService;
}

describe('DevelopmentAuthGuard', () => {
  it('refuses to construct when NODE_ENV=production', () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const developmentUser = { getUser: vi.fn() } as unknown as DevelopmentUserService;

    expect(
      () =>
        new DevelopmentAuthGuard(
          reflector,
          createConfig('production'),
          developmentUser,
          createAuthService(),
        ),
    ).toThrow(/production/);
  });

  it('refuses to construct unless fixed development auth is explicit', () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const developmentUser = { getUser: vi.fn() } as unknown as DevelopmentUserService;
    const config = { nodeEnv: 'test', developmentAuthMode: 'disabled' } as AppConfigService;

    expect(
      () => new DevelopmentAuthGuard(reflector, config, developmentUser, createAuthService()),
    ).toThrow(/explicit fixed development auth/);
  });

  it('allows public routes without fetching the development user', async () => {
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    const developmentUser = { getUser: vi.fn() } as unknown as DevelopmentUserService;
    const guard = new DevelopmentAuthGuard(
      reflector,
      createConfig('development'),
      developmentUser,
      createAuthService(),
    );

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(developmentUser.getUser).not.toHaveBeenCalled();
  });

  it('attaches the fake authenticated user to the request for protected routes', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const user = {
      id: 'dev-user',
      email: 'dev@sparki.local',
      organizationId: 'dev-organization',
      locationId: 'dev-location',
      roles: ['Veterinarian'],
    };
    const developmentUser = {
      getUser: vi.fn().mockResolvedValue(user),
    } as unknown as DevelopmentUserService;
    const guard = new DevelopmentAuthGuard(
      reflector,
      createConfig('test'),
      developmentUser,
      createAuthService(),
    );
    const context = createContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(context.switchToHttp().getRequest<{ user?: unknown }>().user).toEqual(user);
  });

  it('uses a valid local development session cookie when present', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const user = {
      id: 'staff-test-receptionist',
      email: 'testrecept@gmail.com',
      organizationId: 'dev-organization',
      locationId: 'dev-location',
      role: 'RECEPTIONIST',
    };
    const developmentUser = { getUser: vi.fn() } as unknown as DevelopmentUserService;
    const authService = {
      verifySession: vi.fn().mockResolvedValue({ user }),
    } as unknown as AuthService;
    const guard = new DevelopmentAuthGuard(
      reflector,
      createConfig('test'),
      developmentUser,
      authService,
    );
    const context = createContext(`${SESSION_COOKIE_NAME}=dev%3Astaff-test-receptionist`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.verifySession).toHaveBeenCalledWith('dev:staff-test-receptionist');
    expect(developmentUser.getUser).not.toHaveBeenCalled();
    expect(context.switchToHttp().getRequest<{ user?: unknown }>().user).toEqual(user);
  });

  it('resolves the explicit fixed-owner session through the development fixture', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const user = { id: 'dev-user', role: 'OWNER' };
    const developmentUser = {
      getUser: vi.fn().mockResolvedValue(user),
    } as unknown as DevelopmentUserService;
    const authService = { verifySession: vi.fn() } as unknown as AuthService;
    const guard = new DevelopmentAuthGuard(
      reflector,
      createConfig('test'),
      developmentUser,
      authService,
    );
    const context = createContext(`${SESSION_COOKIE_NAME}=dev%3Adev-user`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(developmentUser.getUser).toHaveBeenCalledOnce();
    expect(authService.verifySession).not.toHaveBeenCalled();
    expect(context.switchToHttp().getRequest<{ user?: unknown }>().user).toEqual(user);
  });

  it('rejects a stale cookie instead of falling back to the fixed owner', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const developmentUser = { getUser: vi.fn() } as unknown as DevelopmentUserService;
    const authService = {
      verifySession: vi.fn().mockRejectedValue(new Error('expired')),
    } as unknown as AuthService;
    const guard = new DevelopmentAuthGuard(
      reflector,
      createConfig('test'),
      developmentUser,
      authService,
    );

    await expect(
      guard.canActivate(createContext(`${SESSION_COOKIE_NAME}=stale`)),
    ).rejects.toThrow(/Invalid development session/);
    expect(developmentUser.getUser).not.toHaveBeenCalled();
  });
});
