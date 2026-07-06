import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { DevelopmentAuthGuard } from './development-auth.guard';
import type { DevelopmentUserService } from './development-user.service';

function createContext(): ExecutionContext {
  const request = { headers: {}, user: undefined as unknown };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function createConfig(nodeEnv: 'development' | 'test' | 'production'): AppConfigService {
  return { nodeEnv } as unknown as AppConfigService;
}

describe('DevelopmentAuthGuard', () => {
  it('refuses to construct when NODE_ENV=production', () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const developmentUser = { getUser: vi.fn() } as unknown as DevelopmentUserService;

    expect(
      () => new DevelopmentAuthGuard(reflector, createConfig('production'), developmentUser),
    ).toThrow(/production/);
  });

  it('allows public routes without fetching the development user', async () => {
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    const developmentUser = { getUser: vi.fn() } as unknown as DevelopmentUserService;
    const guard = new DevelopmentAuthGuard(reflector, createConfig('development'), developmentUser);

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
    const guard = new DevelopmentAuthGuard(reflector, createConfig('test'), developmentUser);
    const context = createContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(context.switchToHttp().getRequest<{ user?: unknown }>().user).toEqual(user);
  });
});
