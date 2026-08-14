import { expect, test, type APIRequestContext } from '@playwright/test';
import { prisma } from '@sparki/db';
import { cleanupFixture } from './support/cleanup-fixture';
import { fixtureId } from './support/fixture-id';
import { loginAs } from './support/login';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const ids: { patientIds: string[]; clientIds: string[] } = { patientIds: [], clientIds: [] };

test.afterAll(async () => cleanupFixture(ids));

async function createVisit(request: APIRequestContext) {
  const suffix = fixtureId().slice(-8);
  const clientResponse = await request.post(`${API_URL}/clients`, { data: { firstName: 'Phase', lastName: `Remediation${suffix}`, phone: `555${suffix.slice(0, 7)}` } });
  expect(clientResponse.ok()).toBe(true); const client = await clientResponse.json() as { id: string }; ids.clientIds.push(client.id);
  const patientResponse = await request.post(`${API_URL}/patients`, { data: { name: `Milo ${suffix}`, species: 'Canine', clients: [{ clientId: client.id, isPrimary: true }] } });
  expect(patientResponse.ok()).toBe(true); const patient = await patientResponse.json() as { id: string; name: string }; ids.patientIds.push(patient.id);
  const visitResponse = await request.post(`${API_URL}/visits`, { data: { patientId: patient.id, reason: 'Phase 6 attachment verification' } });
  expect(visitResponse.ok()).toBe(true); const visit = await visitResponse.json() as { id: string };
  return { patient, visit };
}

test('clinical attachment authorization, Medical History visibility, role boundaries, and resume location', async ({ page, request }) => {
  const { patient, visit } = await createVisit(request);
  await loginAs(page, 'testvet@gmail.com');
  await page.goto(`/visits/${visit.id}?from=command-center&resume=visit-attachments`);
  await expect(page.getByRole('heading', { name: 'Attachments' })).toBeVisible();
  await page.getByLabel('Clinical label').fill('Referral image');
  await page.getByLabel('File').setInputFiles({ name: 'referral.png', mimeType: 'image/png', buffer: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]) });
  await page.getByRole('button', { name: 'Add to clinical record' }).click();
  const attachment = page.getByRole('link', { name: 'Referral image' });
  await expect(attachment).toBeVisible();
  const download = await page.request.get(new URL(await attachment.getAttribute('href') ?? '', page.url()).href);
  expect(download.ok()).toBe(true); expect(download.headers()['content-type']).toContain('image/png');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Attachments' })).toBeVisible();

  await page.goto(`/patients/${patient.id}`);
  await page.getByRole('tab', { name: 'Medical History' }).click();
  await expect(page.getByRole('link', { name: 'Referral image' })).toBeVisible();

  const veterinarian = await prisma.user.findUniqueOrThrow({ where: { email: 'testvet@gmail.com' } });
  const record = await prisma.medicalRecord.create({ data: { patientId: patient.id } });
  await prisma.visit.update({ where: { id: visit.id }, data: { medicalRecordId: record.id } });
  await prisma.soapNote.create({ data: { medicalRecordId: record.id, visitId: visit.id, authorId: veterinarian.id, veterinarianId: veterinarian.id, status: 'Locked', lockedAt: new Date() } });
  await page.goto(`/visits/${visit.id}?from=command-center&resume=visit-attachments`);
  await expect(page.getByRole('button', { name: 'Audited removal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Audited removal' }).click();
  await page.getByLabel('Reason').fill('Superseded referral image');
  await page.getByRole('button', { name: 'Confirm audited removal' }).click();
  await expect(page.getByRole('link', { name: 'Referral image' })).toHaveCount(0);
  await page.goto(`/patients/${patient.id}`);
  await page.getByRole('tab', { name: 'Medical History' }).click();
  await expect(page.getByText('Removed from active clinical history')).toBeVisible();
  await expect(page.getByText(/Audited removal by .*Superseded referral image/)).toBeVisible();

  await loginAs(page, 'testrecept@gmail.com');
  await page.goto(`/visits/${visit.id}?from=command-center&resume=visit-attachments`);
  await expect(page.getByRole('heading', { name: 'Attachments' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Remove/ })).toHaveCount(0);
  await expect(page.getByText('Add recommendation')).toHaveCount(0);
  await expect(page.getByText('Record client decision')).toHaveCount(0);
});
