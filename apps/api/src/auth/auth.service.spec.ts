import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma, type User } from '@sparki/db';
import type { AppConfigService } from '../config/app-config.service';
import { AuthService } from './auth.service';

vi.mock('@sparki/db', () => ({
  prisma: {
    organizationMembership: { findMany: vi.fn() },
    clinicLocationAccess: { findMany: vi.fn() },
  },
}));

const findMemberships = vi.mocked(prisma.organizationMembership.findMany);
const findLocationAccesses = vi.mocked(prisma.clinicLocationAccess.findMany);

function createService(): AuthService {
  return new AuthService({
    nodeEnv: 'test',
    developmentAuthMode: 'fixed',
    workos: {},
  } as unknown as AppConfigService);
}

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user_1',
    organizationId: 'legacy_org',
    email: 'vet@example.com',
    phone: null,
    firstName: 'Sarah',
    lastName: 'Kim',
    displayName: null,
    avatarUrl: null,
    statusEmoji: null,
    statusText: null,
    role: 'VETERINARIAN',
    isActive: true,
    workosUserId: 'workos_1',
    canManageAdminSettings: false,
    canFinalizeRecordsForOthers: false,
    canManageMedications: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthService.resolveMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a user from one active organization membership and one active clinic location access', async () => {
    findMemberships.mockResolvedValue([
      {
        id: 'membership_1',
        organizationId: 'org_1',
        userId: 'user_1',
        role: 'VETERINARIAN',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    findLocationAccesses.mockResolvedValue([
      {
        id: 'access_1',
        organizationId: 'org_1',
        clinicLocationId: 'loc_1',
        userId: 'user_1',
        role: 'VETERINARIAN',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(createService().resolveMembership(createUser())).resolves.toEqual({
      id: 'user_1',
      email: 'vet@example.com',
      name: 'Sarah Kim',
      organizationId: 'org_1',
      locationId: 'loc_1',
      role: 'VETERINARIAN',
      canManageAdminSettings: false,
      canFinalizeRecordsForOthers: false,
      canManageMedications: false,
    });
    expect(findMemberships).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true },
    });
    expect(findLocationAccesses).toHaveBeenCalledWith({
      where: { userId: 'user_1', organizationId: 'org_1', isActive: true },
    });
  });

  it('rejects users with no active organization membership', async () => {
    findMemberships.mockResolvedValue([]);

    await expect(createService().resolveMembership(createUser())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findLocationAccesses).not.toHaveBeenCalled();
  });

  it('rejects users with more than one active organization membership', async () => {
    findMemberships.mockResolvedValue([
      {
        id: 'membership_1',
        organizationId: 'org_1',
        userId: 'user_1',
        role: 'VETERINARIAN',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'membership_2',
        organizationId: 'org_2',
        userId: 'user_1',
        role: 'PRACTICE_MANAGER',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(createService().resolveMembership(createUser())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(findLocationAccesses).not.toHaveBeenCalled();
  });

  it('rejects users with no active clinic location access in the resolved organization', async () => {
    findMemberships.mockResolvedValue([
      {
        id: 'membership_1',
        organizationId: 'org_1',
        userId: 'user_1',
        role: 'TECHNICIAN',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    findLocationAccesses.mockResolvedValue([]);

    await expect(createService().resolveMembership(createUser())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects users with more than one active clinic location access in the resolved organization', async () => {
    findMemberships.mockResolvedValue([
      {
        id: 'membership_1',
        organizationId: 'org_1',
        userId: 'user_1',
        role: 'RECEPTIONIST',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    findLocationAccesses.mockResolvedValue([
      {
        id: 'access_1',
        organizationId: 'org_1',
        clinicLocationId: 'loc_1',
        userId: 'user_1',
        role: 'RECEPTIONIST',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'access_2',
        organizationId: 'org_1',
        clinicLocationId: 'loc_2',
        userId: 'user_1',
        role: 'RECEPTIONIST',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(createService().resolveMembership(createUser())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('AuthService configuration', () => {
  it('fails closed when WorkOS is absent and fixed auth is not explicit', () => {
    expect(() => new AuthService({
      nodeEnv: 'development',
      developmentAuthMode: 'disabled',
      workos: {},
    } as unknown as AppConfigService)).toThrow(/refusing to start/);
  });
});
