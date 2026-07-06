import { Injectable } from '@nestjs/common';
import { prisma } from '@sparki/db';
import type { AuthenticatedUser } from './types';

/**
 * Fixed, well-known IDs (not generated cuids) so repeated upserts across
 * server restarts and test runs converge on the same rows instead of
 * accumulating duplicates.
 */
export const DEV_ORGANIZATION_ID = 'dev-organization';
export const DEV_LOCATION_ID = 'dev-location';
export const DEV_USER_ID = 'dev-user';
const DEV_USER_EMAIL = 'dev@sparki.local';

/**
 * The v1 fixed role set (docs/blueprint/08-core-domain-model-v1.md / Role
 * comment in schema.prisma). The dev user gets all of them so local/test
 * development is never blocked by role-capability checks that don't exist
 * yet — narrowing this is a product decision for whenever authorization
 * enforcement actually ships.
 */
const DEV_ROLE_NAMES = [
  'Receptionist',
  'Technician',
  'Veterinarian',
  'Practice Manager',
  'Hospital Owner',
];

/**
 * Stands in for WorkOS AuthKit + Sparki's User/Role mapping (AuthService)
 * until that's implemented. Lives outside AuthService deliberately: this is
 * fake, non-production identity plumbing, not an auth provider.
 */
@Injectable()
export class DevelopmentUserService {
  private userPromise?: Promise<AuthenticatedUser>;

  getUser(): Promise<AuthenticatedUser> {
    this.userPromise ??= this.ensureDevelopmentUser();
    return this.userPromise;
  }

  private async ensureDevelopmentUser(): Promise<AuthenticatedUser> {
    const organization = await prisma.organization.upsert({
      where: { id: DEV_ORGANIZATION_ID },
      update: {},
      create: { id: DEV_ORGANIZATION_ID, name: 'Sparki Development Clinic' },
    });

    const location = await prisma.location.upsert({
      where: { id: DEV_LOCATION_ID },
      update: {},
      create: {
        id: DEV_LOCATION_ID,
        organizationId: organization.id,
        name: 'Development Location',
      },
    });

    const roles = await Promise.all(
      DEV_ROLE_NAMES.map((name) =>
        prisma.role.upsert({
          where: { organizationId_name: { organizationId: organization.id, name } },
          update: {},
          create: { organizationId: organization.id, name },
        }),
      ),
    );

    const user = await prisma.user.upsert({
      where: { id: DEV_USER_ID },
      update: {
        locations: { connect: [{ id: location.id }] },
        roles: { connect: roles.map((role) => ({ id: role.id })) },
      },
      create: {
        id: DEV_USER_ID,
        organizationId: organization.id,
        email: DEV_USER_EMAIL,
        name: 'Development User',
        locations: { connect: [{ id: location.id }] },
        roles: { connect: roles.map((role) => ({ id: role.id })) },
      },
    });

    return {
      id: user.id,
      email: user.email,
      organizationId: organization.id,
      locationId: location.id,
      roles: DEV_ROLE_NAMES,
    };
  }
}
