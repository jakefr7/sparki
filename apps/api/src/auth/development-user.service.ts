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
 * Stands in for WorkOS AuthKit + Sparki's User mapping (AuthService) until
 * that's implemented. Lives outside AuthService deliberately: this is fake,
 * non-production identity plumbing, not an auth provider.
 *
 * OWNER so local/test development is never blocked by role-capability
 * checks that don't exist yet — narrowing this is a product decision for
 * whenever authorization enforcement actually ships.
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

    const user = await prisma.user.upsert({
      where: { id: DEV_USER_ID },
      update: {
        locations: { connect: [{ id: location.id }] },
      },
      create: {
        id: DEV_USER_ID,
        organizationId: organization.id,
        email: DEV_USER_EMAIL,
        firstName: 'Development',
        lastName: 'User',
        role: 'OWNER',
        locations: { connect: [{ id: location.id }] },
        staffProfile: {
          create: { canReceiveAppointments: true, canOwnVisits: true },
        },
      },
    });

    return {
      id: user.id,
      email: user.email,
      organizationId: organization.id,
      locationId: location.id,
      role: user.role,
    };
  }
}
