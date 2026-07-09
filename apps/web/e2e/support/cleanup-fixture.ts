import { prisma } from '@sparki/db';

/**
 * Deletes e2e-created Client/Patient rows (and anything referencing them:
 * Visit, Appointment, PatientClient) by EXACT id only — never by a broad
 * organizationId sweep or name pattern. This is what stops Playwright runs
 * from leaving visible junk behind in the shared local dev database: call
 * this from a `test.afterAll` with every patientId/clientId the file
 * created.
 *
 * Safe by construction: protected local demo data (scripts/seed-local-clinic-
 * demo-data.mjs) uses fixed `local-demo-*` ids that can never appear in the
 * arrays passed here, since those come from freshly created rows' own
 * generated ids.
 */
export async function cleanupFixture({
  patientIds = [],
  clientIds = [],
}: {
  patientIds?: string[];
  clientIds?: string[];
}): Promise<void> {
  if (patientIds.length === 0 && clientIds.length === 0) return;

  const linkedWhere = {
    OR: [{ patientId: { in: patientIds } }, { clientId: { in: clientIds } }],
  };

  await prisma.visit.deleteMany({ where: linkedWhere });
  await prisma.appointment.deleteMany({ where: linkedWhere });
  await prisma.patientClient.deleteMany({ where: linkedWhere });
  await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
}
