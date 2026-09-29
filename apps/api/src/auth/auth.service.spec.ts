import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma, type User } from '@sparki/db';
import type { AppConfigService } from '../config/app-config.service';
import type { EmailService } from '../email/email.service';
import { AuthService } from './auth.service';

vi.mock('@sparki/db', () => ({
  prisma: {
    organizationMembership: { findMany: vi.fn() },
    clinicLocationAccess: { findMany: vi.fn() },
    organization: { findUniqueOrThrow: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

const { mockUserManagement, WorkOSMock } = vi.hoisted(() => {
  const mockUserManagement = {
    createMagicAuth: vi.fn(),
    authenticateWithMagicAuth: vi.fn(),
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
  };
  return { mockUserManagement, WorkOSMock: vi.fn().mockImplementation(() => ({ userManagement: mockUserManagement })) };
});

vi.mock('@workos-inc/node', () => ({ WorkOS: WorkOSMock }));

const findMemberships = vi.mocked(prisma.organizationMembership.findMany);
const findLocationAccesses = vi.mocked(prisma.clinicLocationAccess.findMany);
const findOrganization = vi.mocked(prisma.organization.findUniqueOrThrow);
const findUser = vi.mocked(prisma.user.findUnique);
const updateUser = vi.mocked(prisma.user.update);

function createFakeEmail(): { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

function createService(): AuthService {
  return new AuthService(
    {
      nodeEnv: 'test',
      developmentAuthMode: 'fixed',
      workos: {},
    } as unknown as AppConfigService,
    createFakeEmail() as unknown as EmailService,
  );
}

/** WorkOS configured (Magic Auth requires the real client, not fixed dev
 *  auth) — used by the requestEmailCode/verifyEmailCode tests below. */
function createConfiguredService(): { service: AuthService; email: { send: ReturnType<typeof vi.fn> } } {
  const email = createFakeEmail();
  const service = new AuthService(
    {
      nodeEnv: 'test',
      developmentAuthMode: 'disabled',
      workos: { apiKey: 'test_key', clientId: 'client_1', cookiePassword: 'cookie_pw' },
      webOrigin: 'http://127.0.0.1:3000',
    } as unknown as AppConfigService,
    email as unknown as EmailService,
  );
  return { service, email };
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
    lastEmailCodeRequestedAt: null,
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
    findOrganization.mockResolvedValue({ subscriptionStatus: 'ACTIVE' } as never);
  });

  it('resolves a user from one active organization membership and one active clinic location access', async () => {
    findMemberships.mockResolvedValue([
      {
        id: 'membership_1',
        organizationId: 'org_1',
        userId: 'user_1',
        role: 'VETERINARIAN',
        isActive: true,
        status: 'ACTIVE',
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
      subscriptionStatus: 'ACTIVE',
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

  it('carries the resolved organization\'s current subscription status', async () => {
    findMemberships.mockResolvedValue([
      {
        id: 'membership_1',
        organizationId: 'org_1',
        userId: 'user_1',
        role: 'VETERINARIAN',
        isActive: true,
        status: 'ACTIVE',
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
    findOrganization.mockResolvedValue({ subscriptionStatus: 'PAST_DUE' } as never);

    const resolved = await createService().resolveMembership(createUser());

    expect(resolved.subscriptionStatus).toBe('PAST_DUE');
    expect(findOrganization).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      select: { subscriptionStatus: true },
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
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'membership_2',
        organizationId: 'org_2',
        userId: 'user_1',
        role: 'PRACTICE_MANAGER',
        isActive: true,
        status: 'ACTIVE',
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
        status: 'ACTIVE',
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
        status: 'ACTIVE',
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

describe('AuthService WorkOS client construction', () => {
  it('passes clientId when constructing the WorkOS client, not just per-call — required for session verification', () => {
    // UserManagement.jwks (used by loadSealedSession(...).authenticate()/
    // refresh() to verify a session's JWT) reads clientId from the client's
    // own construction options, not from any per-call argument. Regression
    // test for a bug where every session verification threw "Missing
    // client ID" even though login/signup (which pass clientId per-call)
    // worked fine.
    vi.clearAllMocks();
    createConfiguredService();

    expect(WorkOSMock).toHaveBeenCalledWith('test_key', { clientId: 'client_1' });
  });
});

describe('AuthService.ensureWorkosCredential', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new WorkOS user when none exists for the email', async () => {
    mockUserManagement.listUsers.mockResolvedValue({ data: [] });
    mockUserManagement.createUser.mockResolvedValue({ id: 'workos_new' });
    const { service } = createConfiguredService();

    const id = await service.ensureWorkosCredential({
      email: 'new@example.com',
      password: 'CorrectHorseBattery1',
      firstName: 'New',
      lastName: 'User',
    });

    expect(id).toBe('workos_new');
    expect(mockUserManagement.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', password: 'CorrectHorseBattery1' }),
    );
  });

  it('updates the existing WorkOS user when one already matches the email', async () => {
    mockUserManagement.listUsers.mockResolvedValue({ data: [{ id: 'workos_existing' }] });
    mockUserManagement.updateUser.mockResolvedValue({ id: 'workos_existing' });
    const { service } = createConfiguredService();

    const id = await service.ensureWorkosCredential({
      email: 'existing@example.com',
      password: 'CorrectHorseBattery1',
      firstName: 'Existing',
      lastName: 'User',
    });

    expect(id).toBe('workos_existing');
    expect(mockUserManagement.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'workos_existing', password: 'CorrectHorseBattery1' }),
    );
  });

  it('turns a WorkOS password-strength rejection into a readable BadRequestException instead of a generic failure', async () => {
    mockUserManagement.listUsers.mockResolvedValue({ data: [] });
    mockUserManagement.createUser.mockRejectedValue({
      name: 'BadRequestException',
      status: 400,
      code: 'password_strength_error',
      message: 'Password does not meet strength requirements.',
      errors: [
        { message: 'Please try a password with 10 or more characters.', code: 'password_too_short' },
        { message: 'This is a commonly used password.', code: 'password_too_weak' },
      ],
    });
    const { service } = createConfiguredService();

    const rejection = service.ensureWorkosCredential({
      email: 'weak@example.com',
      password: 'password1',
      firstName: 'Weak',
      lastName: 'Password',
    });

    await expect(rejection).rejects.toBeInstanceOf(BadRequestException);
    await expect(rejection).rejects.toMatchObject({
      response: {
        code: 'PASSWORD_TOO_WEAK',
        message: 'Please try a password with 10 or more characters. This is a commonly used password.',
      },
    });
  });

  it('passes through an unrelated WorkOS failure unchanged', async () => {
    mockUserManagement.listUsers.mockResolvedValue({ data: [] });
    mockUserManagement.createUser.mockRejectedValue(new Error('WorkOS is down'));
    const { service } = createConfiguredService();

    await expect(
      service.ensureWorkosCredential({ email: 'x@example.com', password: 'CorrectHorseBattery1', firstName: 'X', lastName: 'Y' }),
    ).rejects.toThrow('WorkOS is down');
  });
});

describe('AuthService configuration', () => {
  it('fails closed when WorkOS is absent and fixed auth is not explicit', () => {
    expect(() => new AuthService(
      {
        nodeEnv: 'development',
        developmentAuthMode: 'disabled',
        workos: {},
      } as unknown as AppConfigService,
      createFakeEmail() as unknown as EmailService,
    )).toThrow(/refusing to start/);
  });
});

describe('AuthService.requestEmailCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing for an email with no matching local user — never reveals whether an account exists', async () => {
    findUser.mockResolvedValue(null);
    const { service } = createConfiguredService();

    await service.requestEmailCode('nobody@example.test');

    expect(mockUserManagement.createMagicAuth).not.toHaveBeenCalled();
  });

  it('does nothing for a user with no linked WorkOS credential yet', async () => {
    findUser.mockResolvedValue(createUser({ workosUserId: null }));
    const { service } = createConfiguredService();

    await service.requestEmailCode('vet@example.com');

    expect(mockUserManagement.createMagicAuth).not.toHaveBeenCalled();
  });

  it('does nothing for an inactive user', async () => {
    findUser.mockResolvedValue(createUser({ isActive: false }));
    const { service } = createConfiguredService();

    await service.requestEmailCode('vet@example.com');

    expect(mockUserManagement.createMagicAuth).not.toHaveBeenCalled();
  });

  it('does nothing within the cooldown window since the last request', async () => {
    findUser.mockResolvedValue(createUser({ lastEmailCodeRequestedAt: new Date(Date.now() - 5_000) }));
    const { service, email } = createConfiguredService();

    await service.requestEmailCode('vet@example.com');

    expect(mockUserManagement.createMagicAuth).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('requests a WorkOS magic auth code and emails it for an active linked user', async () => {
    findUser.mockResolvedValue(createUser({ lastEmailCodeRequestedAt: null }));
    mockUserManagement.createMagicAuth.mockResolvedValue({
      id: 'magic_auth_1',
      userId: 'workos_1',
      email: 'vet@example.com',
      code: '482913',
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    updateUser.mockResolvedValue(createUser());
    const { service, email } = createConfiguredService();

    await service.requestEmailCode('Vet@Example.com');

    expect(mockUserManagement.createMagicAuth).toHaveBeenCalledWith({ email: 'vet@example.com' });
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { lastEmailCodeRequestedAt: expect.any(Date) },
    });
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'vet@example.com', text: expect.stringContaining('482913') }),
    );
  });
});

describe('AuthService.verifyEmailCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOrganization.mockResolvedValue({ subscriptionStatus: 'ACTIVE' } as never);
  });

  it('signs in with a valid code and resolves the local session', async () => {
    mockUserManagement.authenticateWithMagicAuth.mockResolvedValue({
      sealedSession: 'sealed_abc',
      user: { id: 'workos_1' },
    });
    findUser.mockResolvedValue(createUser());
    findMemberships.mockResolvedValue([
      {
        id: 'membership_1',
        organizationId: 'org_1',
        userId: 'user_1',
        role: 'VETERINARIAN',
        isActive: true,
        status: 'ACTIVE',
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

    const { service } = createConfiguredService();
    const result = await service.verifyEmailCode('vet@example.com', '482913');

    expect(mockUserManagement.authenticateWithMagicAuth).toHaveBeenCalledWith({
      clientId: 'client_1',
      email: 'vet@example.com',
      code: '482913',
      session: { sealSession: true, cookiePassword: 'cookie_pw' },
    });
    expect(result.sealedSession).toBe('sealed_abc');
    expect(result.user.email).toBe('vet@example.com');
  });

  it('rejects an invalid or expired code', async () => {
    mockUserManagement.authenticateWithMagicAuth.mockRejectedValue(new Error('invalid code'));
    const { service } = createConfiguredService();

    await expect(service.verifyEmailCode('vet@example.com', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
