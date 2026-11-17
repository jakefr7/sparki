import { expect, test } from '@playwright/test';
import { prisma } from '@sparki/db';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

test('technician history and visit notes can be corrected until finalization, then remain locked', async ({ page, request }) => {
  const client = await (await request.post(`${API_URL}/clients`, { data: { firstName: 'SPA47', lastName: 'Corrections' } })).json();
  const patient = await (await request.post(`${API_URL}/patients`, { data: { name: 'SPA47 Technician Corrections', species: 'Dog', clients: [{ clientId: client.id, isPrimary: true }] } })).json();
  const visit = await (await request.post(`${API_URL}/visits`, { data: { patientId: patient.id, reason: 'Synthetic technician care' } })).json();
  await prisma.visit.update({ where: { id: visit.id }, data: { visitType: 'TechnicianAppointment', state: 'CheckoutReady', phase: 'Discharge', assignedTechnicianId: 'dev-user' } });
  await prisma.visitIntake.create({ data: { visitId: visit.id, historyNotes: 'Original technician history', weight: 22, completedAt: new Date() } });
  await prisma.visitDischarge.create({ data: { visitId: visit.id, instructions: 'Synthetic home care instructions', completedById: 'dev-user' } });
  const record = await prisma.medicalRecord.create({ data: { patientId: patient.id } });
  await prisma.soapNote.create({ data: { visitId: visit.id, medicalRecordId: record.id, authorId: 'dev-user', subjective: 'Intake history: Original technician history', objective: 'Recorded technician observations' } });

  await page.goto(`/visits/${visit.id}?view=record`);
  await expect(page.getByRole('button', { name: 'Finalize visit', exact: true })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Complete assessment / care notes and care plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to discharge', exact: false }).click();
  await page.getByRole('button', { name: 'Back to care plan', exact: false }).click();
  await page.getByRole('button', { name: 'Back to treatment plan', exact: false }).click();
  await page.getByRole('link', { name: 'Back to visit notes', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Technician visit notes' })).toBeVisible();
  await page.getByLabel('Assessment / care notes').fill('Synthetic technician care assessment');
  await page.getByLabel('Care plan', { exact: true }).fill('Synthetic technician care plan');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page).toHaveURL(new RegExp(`view=plan`));
  await page.getByRole('link', { name: 'Edit history & vitals' }).click();
  await page.locator('#historyNotes').fill('Corrected technician history');
  await page.getByRole('button', { name: 'Done editing' }).click();
  await expect(page).toHaveURL(new RegExp(`view=plan`));
  await page.goto(`/visits/${visit.id}?view=record`);
  await expect(page.locator('.visit-final-overview')).toContainText('Corrected technician history');
  await expect(page.locator('.visit-final-overview')).toContainText('Synthetic technician care assessment');
  await expect(page.locator('.visit-final-overview')).toContainText('Synthetic technician care plan');
  await page.getByRole('button', { name: 'Finalize visit', exact: true }).click();
  await expect(page).toHaveURL('/');

  for (const view of ['intake', 'exam', 'record', 'discharge']) {
    await page.goto(`/visits/${visit.id}?view=${view}`);
    await expect(page.locator('#historyNotes')).toHaveCount(0);
    await expect(page.locator('textarea[name="assessment"]')).toHaveCount(0);
    await expect(page.locator('textarea[name="instructions"]')).toHaveCount(0);
  }
  const signed = await prisma.soapNote.findFirstOrThrow({ where: { visitId: visit.id, status: 'Locked' } });
  expect(signed.subjective).toContain('Corrected technician history');
  const intakeSave = await request.put(`${API_URL}/visits/${visit.id}/intake`, { data: { historyNotes: 'Forbidden late change' } });
  expect(intakeSave.status()).toBe(409);
  const examSave = await request.put(`${API_URL}/visits/${visit.id}/exam-findings`, { data: { assessment: 'Forbidden late change' } });
  expect(examSave.status()).toBe(409);
  const recordSave = await request.put(`${API_URL}/visits/${visit.id}/record/draft`, { data: { version: signed.version, subjective: 'Forbidden late change', objective: 'Changed', assessment: 'Changed', plan: 'Changed' } });
  expect(recordSave.status()).toBe(409);
  const dischargeSave = await request.put(`${API_URL}/visits/${visit.id}/discharge`, { data: { instructions: 'Forbidden late instructions' } });
  expect(dischargeSave.status()).toBe(409);
  const careSave = await request.post(`${API_URL}/visits/${visit.id}/work-items`, { data: { type: 'Diagnostic', title: 'Forbidden late clinical order' } });
  expect(careSave.status()).toBe(409);
  expect(await prisma.soapNote.count({ where: { visitId: visit.id } })).toBe(1);
});
