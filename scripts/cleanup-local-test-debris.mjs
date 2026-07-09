// =============================================================================
// Local test-debris cleanup — safe, narrow, name-pattern-based
// =============================================================================
// Deletes ONLY rows that clearly match known automated-test fixture naming
// (Playwright/vitest e2e specs that got interrupted before their own
// afterAll/teardown cleanup ran, e.g. "Playwright Patient 3pp4ig",
// "Schedule Client ilbkoz", "ExistingIntake Client g50wc0"). It never does a
// broad organizationId-only sweep and never touches:
//   - rows where sourceSystem = 'sparki-local-demo' (protected local demo
//     data from scripts/seed-local-clinic-demo-data.mjs)
//   - dev auth users / staff / organizations / locations
//   - anything not matching one of the literal junk-name patterns below
//
// Usage: pnpm cleanup:test-debris   (from repo root; needs DATABASE_URL)
// =============================================================================

import prismaClientPackage from '../packages/db/generated/client/index.js';

const { PrismaClient } = prismaClientPackage;
const prisma = new PrismaClient();

const PROTECTED_SOURCE_SYSTEM = 'sparki-local-demo';

// `{ sourceSystem: { not: X } }` alone would exclude NULL rows too (SQL
// three-valued logic: `NULL <> 'x'` is unknown, not true) — and every one of
// these junk rows has sourceSystem = null, since they predate any tagging.
// Without the null branch this filter would silently match nothing.
const NOT_PROTECTED = {
  OR: [{ sourceSystem: null }, { sourceSystem: { not: PROTECTED_SOURCE_SYSTEM } }],
};

// Literal prefixes/fragments used by apps/web/e2e/*.spec.ts and
// apps/api/test/*.e2e-spec.ts fixture data. Narrow and explicit on purpose —
// extend this list only when a new test file introduces a new literal
// fixture-name fragment, never with a broad wildcard.
const JUNK_NAME_FRAGMENTS = [
  'Playwright',
  'Schedule Patient',
  'Schedule Client',
  'Visit Patient',
  'Visit Client',
  'ExistingIntake',
  'NoApptIntake',
];

// Client firstName/lastName are separate columns (e.g. firstName: 'Schedule',
// lastName: 'Client 3671yp'), so a two-word fragment like 'Schedule Client'
// never matches either column on its own — these single-word fragments
// catch the client side of the same fixtures.
const JUNK_FIRST_NAME_FRAGMENTS = ['Playwright', 'Schedule', 'Visit', 'ExistingIntake', 'NoApptIntake'];

// Explicit provenance tags an automated test suite may set itself (e.g. via
// the sourceSystem passthrough on POST /clients and /patients). Rows tagged
// this way are just as clearly test debris as a name-pattern match, and are
// caught regardless of what visible name they used.
const TEST_SOURCE_SYSTEMS = ['sparki-e2e-test', 'playwright-test'];

function fragmentFilters(field, fragments = JUNK_NAME_FRAGMENTS) {
  return fragments.map((fragment) => ({ [field]: { contains: fragment } }));
}

async function main() {
  const junkClients = await prisma.client.findMany({
    where: {
      AND: [
        NOT_PROTECTED,
        {
          OR: [
            ...fragmentFilters('firstName', JUNK_FIRST_NAME_FRAGMENTS),
            ...fragmentFilters('lastName'),
            { sourceSystem: { in: TEST_SOURCE_SYSTEMS } },
          ],
        },
      ],
    },
    select: { id: true, firstName: true, lastName: true },
  });
  const junkPatients = await prisma.patient.findMany({
    where: {
      AND: [
        NOT_PROTECTED,
        { OR: [...fragmentFilters('name'), { sourceSystem: { in: TEST_SOURCE_SYSTEMS } }] },
      ],
    },
    select: { id: true, name: true },
  });

  const junkClientIds = junkClients.map((client) => client.id);
  const junkPatientIds = junkPatients.map((patient) => patient.id);

  console.log(`Found ${junkClientIds.length} junk clients, ${junkPatientIds.length} junk patients.`);
  if (junkClientIds.length === 0 && junkPatientIds.length === 0) {
    console.log('Nothing to clean up.');
    return;
  }

  const linkedWhere = {
    OR: [{ patientId: { in: junkPatientIds } }, { clientId: { in: junkClientIds } }],
  };

  // Dependency-safe order: visits/appointments/join rows before the
  // patient/client rows they reference.
  const visits = await prisma.visit.deleteMany({ where: linkedWhere });
  const appointments = await prisma.appointment.deleteMany({
    where: { AND: [linkedWhere, NOT_PROTECTED] },
  });
  const patientClients = await prisma.patientClient.deleteMany({ where: linkedWhere });
  const patients = await prisma.patient.deleteMany({ where: { id: { in: junkPatientIds } } });
  const clients = await prisma.client.deleteMany({ where: { id: { in: junkClientIds } } });

  console.log('Deleted:');
  console.log(`  Visits: ${visits.count}`);
  console.log(`  Appointments: ${appointments.count}`);
  console.log(`  PatientClient links: ${patientClients.count}`);
  console.log(`  Patients: ${patients.count}`);
  console.log(`  Clients: ${clients.count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
