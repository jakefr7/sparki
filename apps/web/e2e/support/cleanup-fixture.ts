import { prisma } from '@sparki/db';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

/** Retries a single delete step on a transient failure (e.g. the brief local
 *  Postgres/Docker connectivity blips observed during long Playwright runs)
 *  so one flaky step doesn't abort the rest of the cleanup sequence. Each
 *  step is a `deleteMany` by exact id, which is idempotent — retrying (or
 *  rerunning cleanupFixture later with the same ids) never errors just
 *  because a prior attempt already deleted some of the rows. */
async function deleteWithRetry(run: () => Promise<unknown>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      await run();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Deletes e2e-created Client/Patient rows (and anything referencing them:
 * Visit, Appointment, PatientClient) by EXACT id only — never by a broad
 * organizationId sweep or name pattern. This is what stops Playwright runs
 * from leaving visible junk behind in the shared local dev database: call
 * this from a `test.afterAll` (or, better, `test.afterEach` for rows a test
 * creates itself — see new-patient-appointment.spec.ts) with every
 * patientId/clientId the file created.
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

  const attachments = await prisma.clinicalAttachment.findMany({ where: { patientId: { in: patientIds } }, select: { id: true } });
  await deleteWithRetry(() => prisma.clinicalAttachmentEvent.deleteMany({ where: { attachmentId: { in: attachments.map((attachment) => attachment.id) } } }));
  await deleteWithRetry(() => prisma.clinicalAttachment.deleteMany({ where: { id: { in: attachments.map((attachment) => attachment.id) } } }));

  await deleteWithRetry(() => prisma.visit.deleteMany({ where: linkedWhere }));
  await deleteWithRetry(() => prisma.appointment.deleteMany({ where: linkedWhere }));
  await deleteWithRetry(() => prisma.patientAlert.deleteMany({ where: { patientId: { in: patientIds } } }));
  await deleteWithRetry(() => prisma.patientMedication.deleteMany({ where: { patientId: { in: patientIds } } }));
  await deleteWithRetry(() => prisma.patientClient.deleteMany({ where: linkedWhere }));
  await deleteWithRetry(() => prisma.patient.deleteMany({ where: { id: { in: patientIds } } }));
  await deleteWithRetry(() => prisma.client.deleteMany({ where: { id: { in: clientIds } } }));
}
