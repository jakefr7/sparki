// Creates/links the 3 dev staff-login test accounts documented in
// docs/engineering/00-engineering-plan.md's WorkOS AuthKit auth split:
// WorkOS owns the credential (email/password), Sparki's own User/StaffProfile/
// OrganizationMembership/ClinicLocationAccess own role and clinic membership
// (see ADR-006), linked by User.workosUserId.
//
// Idempotent: re-running updates the existing WorkOS user (password reset to
// the dev password, re-verified) and upserts the same Sparki User/membership
// rows by fixed id, so repeated runs never create duplicates.
//
// Usage: pnpm db:seed-auth-users   (from repo root; needs DATABASE_URL and,
// to actually create the WorkOS side, WORKOS_API_KEY + WORKOS_CLIENT_ID in
// .env). Joins the same dev clinic as scripts/reset-demo-clinic-data.mjs.
import { WorkOS } from '@workos-inc/node';
import prismaClientPackage from '../packages/db/generated/client/index.js';

const { PrismaClient } = prismaClientPackage;
const prisma = new PrismaClient();

const DEV_ORGANIZATION_ID = 'dev-organization';
const DEV_LOCATION_ID = 'dev-location';
const DEV_PASSWORD = 'SparkiTest123!';

const TEST_USERS = [
  {
    id: 'staff-test-receptionist',
    email: 'testrecept@gmail.com',
    firstName: 'Maria',
    lastName: 'Alvarez',
    role: 'FRONT_DESK',
    jobTitle: 'Receptionist',
    canReceiveAppointments: false,
    canOwnVisits: true,
    color: '#F59E0B',
  },
  {
    id: 'staff-test-technician',
    email: 'testtech@gmail.com',
    firstName: 'Ben',
    lastName: 'Carter',
    role: 'TECHNICIAN',
    jobTitle: 'Veterinary Technician',
    canReceiveAppointments: true,
    canOwnVisits: true,
    color: '#DB2777',
  },
  {
    id: 'staff-test-veterinarian',
    email: 'testvet@gmail.com',
    firstName: 'Sarah',
    lastName: 'Kim',
    displayName: 'Dr. Sarah Kim',
    role: 'VETERINARIAN',
    jobTitle: 'Veterinarian',
    licenseNumber: 'VET-TEST-01',
    canReceiveAppointments: true,
    canOwnVisits: true,
    color: '#059669',
  },
];

async function ensureDevClinic() {
  const organization = await prisma.organization.upsert({
    where: { id: DEV_ORGANIZATION_ID },
    update: {},
    create: { id: DEV_ORGANIZATION_ID, name: 'Sparki Development Clinic' },
  });
  const location = await prisma.location.upsert({
    where: { id: DEV_LOCATION_ID },
    update: {},
    create: { id: DEV_LOCATION_ID, organizationId: organization.id, name: 'Main Hospital' },
  });
  return { organization, location };
}

/** Returns the WorkOS user id to link, or null if WorkOS isn't configured
 *  (DB rows still get upserted below; login just won't work until a WorkOS
 *  user exists and is linked). */
async function ensureWorkosUser(workos, member) {
  if (!workos) {
    return null;
  }

  const existing = await workos.userManagement.listUsers({ email: member.email, limit: 1 });
  const [match] = existing.data;

  if (match) {
    await workos.userManagement.updateUser({
      userId: match.id,
      password: DEV_PASSWORD,
      emailVerified: true,
      firstName: member.firstName,
      lastName: member.lastName,
    });
    return match.id;
  }

  const created = await workos.userManagement.createUser({
    email: member.email,
    password: DEV_PASSWORD,
    emailVerified: true,
    firstName: member.firstName,
    lastName: member.lastName,
  });
  return created.id;
}

async function main() {
  const apiKey = process.env.WORKOS_API_KEY;
  const clientId = process.env.WORKOS_CLIENT_ID;
  const workos = apiKey ? new WorkOS(apiKey) : null;

  if (!workos || !clientId) {
    console.warn(
      '\nWORKOS_API_KEY / WORKOS_CLIENT_ID not set — skipping WorkOS user creation.\n' +
        'Sparki DB rows below will still be upserted, but with no workosUserId, so\n' +
        'login will fail until they are linked. To fix:\n' +
        '  1. In the WorkOS dashboard, go to User Management -> Users -> Create User\n' +
        '     for each address below, with password SparkiTest123! and "Email verified" checked.\n' +
        '  2. Set WORKOS_API_KEY and WORKOS_CLIENT_ID in .env.\n' +
        '  3. Re-run `pnpm db:seed-auth-users` to link the WorkOS user id to the Sparki DB row.\n',
    );
  }

  const { organization, location } = await ensureDevClinic();

  for (const member of TEST_USERS) {
    const workosUserId = await ensureWorkosUser(workos, member);

    await prisma.user.upsert({
      where: { id: member.id },
      update: {
        organizationId: organization.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        displayName: member.displayName ?? null,
        role: member.role,
        isActive: true,
        ...(workosUserId ? { workosUserId } : {}),
        locations: { set: [{ id: location.id }] },
        staffProfile: {
          upsert: {
            update: {
              jobTitle: member.jobTitle,
              licenseNumber: member.licenseNumber ?? null,
              canReceiveAppointments: member.canReceiveAppointments,
              canOwnVisits: member.canOwnVisits,
              color: member.color,
            },
            create: {
              jobTitle: member.jobTitle,
              licenseNumber: member.licenseNumber ?? null,
              canReceiveAppointments: member.canReceiveAppointments,
              canOwnVisits: member.canOwnVisits,
              color: member.color,
            },
          },
        },
      },
      create: {
        id: member.id,
        organizationId: organization.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        displayName: member.displayName ?? null,
        role: member.role,
        isActive: true,
        workosUserId,
        locations: { connect: [{ id: location.id }] },
        staffProfile: {
          create: {
            jobTitle: member.jobTitle,
            licenseNumber: member.licenseNumber ?? null,
            canReceiveAppointments: member.canReceiveAppointments,
            canOwnVisits: member.canOwnVisits,
            color: member.color,
          },
        },
      },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });

    // ADR-006: additive alongside the User.organizationId/role write above —
    // AuthService.resolveMembership reads these tables, not User directly, so
    // a seeded test user needs both during the transition.
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      update: { role: member.role, isActive: true },
      create: {
        organizationId: organization.id,
        userId: user.id,
        role: member.role,
        isActive: true,
      },
    });
    await prisma.clinicLocationAccess.upsert({
      where: { clinicLocationId_userId: { clinicLocationId: location.id, userId: user.id } },
      update: { role: member.role, isActive: true },
      create: {
        organizationId: organization.id,
        clinicLocationId: location.id,
        userId: user.id,
        role: member.role,
        isActive: true,
      },
    });

    console.log(`  ${workosUserId ? '✓' : '~'} ${member.email} (${member.role})`);
  }

  console.log('\nDev login credentials (all three accounts):');
  console.log(`  password: ${DEV_PASSWORD}`);
  for (const member of TEST_USERS) {
    console.log(`  ${member.email} — ${member.role}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
