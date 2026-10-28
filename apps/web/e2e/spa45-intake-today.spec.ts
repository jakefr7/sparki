import { expect, test } from '@playwright/test';
import { prisma } from '@sparki/db';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

async function fixture(request: import('@playwright/test').APIRequestContext, name: string) {
  const client = await (await request.post(`${API_URL}/clients`, { data: { firstName: 'SPA45', lastName: 'Vitals' } })).json();
  const patientResponse = await request.post(`${API_URL}/patients`, { data: { name, species: 'Dog', clients: [{ clientId: client.id, isPrimary: true }] } });
  expect(patientResponse.ok()).toBe(true);
  const patient = await patientResponse.json();
  const created = await request.post(`${API_URL}/visits`, { data: { patientId: patient.id, reason: 'SPA45 new findings', primaryVeterinarianId: 'dev-user' } });
  expect(created.ok()).toBe(true);
  return { patient, visit: await created.json() };
}

test('intake preserves old numeric CRT, saves Pant and explicit Not Assessed, and proceeds to exam', async ({ page, request }) => {
  const { visit } = await fixture(request, 'SPA45 observed vitals');
  await request.post(`${API_URL}/visits/${visit.id}/start`);
  const saved = await request.put(`${API_URL}/visits/${visit.id}/intake`, { data: { historyNotes: 'Baseline history', weight: 22, temperature: 101, heartRate: 90, respiratoryRate: 24, crtSeconds: 1.5, gumColor: 'Pink' } });
  expect(saved.ok()).toBe(true);
  await page.goto(`/visits/${visit.id}`);
  await expect(page.locator('#crtSeconds')).toHaveValue('LegacyMeasurement');
  await page.locator('#historyNotes').fill('Reviewed baseline history');
  await expect.poll(async () => (await (await request.get(`${API_URL}/visits/${visit.id}`)).json()).intake.historyNotes).toBe('Reviewed baseline history');
  let intake = (await (await request.get(`${API_URL}/visits/${visit.id}`)).json()).intake;
  expect(intake.crtSeconds).toBe(1.5);
  await page.getByRole('combobox', { name: 'Respiratory observation', exact: true }).selectOption('Pant');
  await page.getByRole('combobox', { name: 'Capillary refill', exact: true }).selectOption('NotAssessed');
  await expect.poll(async () => (await (await request.get(`${API_URL}/visits/${visit.id}`)).json()).intake.crtAssessment).toBe('NotAssessed');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Respiratory observation', exact: true })).toHaveValue('Pant');
  await expect(page.getByRole('combobox', { name: 'Capillary refill', exact: true })).toHaveValue('NotAssessed');
  intake = (await (await request.get(`${API_URL}/visits/${visit.id}`)).json()).intake;
  expect(intake.respiratoryRate).toBeNull();
  expect(intake.crtSeconds).toBeNull();
  await page.getByRole('button', { name: 'Ready for Veterinarian', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start exam', exact: true })).toBeVisible();
  await expect(page.locator('.intake-readonly-summary')).toContainText('Pant');
  await expect(page.locator('.intake-readonly-summary')).toContainText('CRT Not Assessed');
  await page.getByRole('button', { name: 'Start exam', exact: true }).click();
  await expect(page.locator('.exam-intake-drawer')).toContainText('Pant');
  await expect(page.locator('.exam-intake-drawer')).toContainText('Not Assessed');
  await page.reload();
  await expect(page.locator('.exam-intake-drawer')).toContainText('Pant');
  await expect(page.locator('.exam-intake-drawer')).toContainText('Not Assessed');
});

for (const visitType of ['Scheduled', 'TechnicianAppointment'] as const) {
test(`Today fits desktop/tablet cards and continues ${visitType} discharge toward checkout`, async ({ page, request }) => {
  const { visit, patient } = await fixture(request, `SPA45 ${visitType} patient with a long name to check layout`);
  // Disposable fixture represents the reported state; production transitions remain guarded.
  await prisma.visit.update({ where: { id: visit.id }, data: { visitType, state: 'CheckoutReady', phase: 'Discharge' } });
  await prisma.visitIntake.create({ data: { visitId: visit.id, historyNotes: 'Recorded intake', completedAt: new Date() } });
  if (visitType === 'Scheduled') await prisma.visitExamFindings.create({ data: { visitId: visit.id, assessment: 'Fixture exam', completedAt: new Date() } });
  await request.get(`${API_URL}/dashboard-status-colors`);
  await page.goto('/today');
  const row = page.locator('.today-appointment-row').filter({ hasText: patient.name });
  await expect(row).toBeVisible();
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => row.evaluate(element => {
      const rowBox = element.getBoundingClientRect();
      const card = element.closest('.today-main-card')!.getBoundingClientRect();
      return rowBox.right <= card.right && element.scrollWidth <= element.clientWidth;
    })).toBe(true);
    await expect.poll(() => page.locator('.today-rail').evaluate(rail => [...rail.querySelectorAll('.today-summary-list > div')].every(element => {
      const box = element.getBoundingClientRect();
      const card = element.closest('.home-widget')!.getBoundingClientRect();
      return box.right <= card.right && element.scrollWidth <= element.clientWidth;
    }))).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: '/tmp/sparki-spa45-today-tablet.png', fullPage: true });
  const statusChanges: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/visits/${visit.id}/dashboard-status`)) statusChanges.push(request.url());
  });
  await row.getByRole('button', { name: 'Discharge', exact: true }).click();
  await page.getByRole('link', { name: 'Continue to Checkout', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/visits/${visit.id}$`));
  await expect(page.getByText(patient.name, { exact: true }).first()).toBeVisible();
  await expect(page.locator('textarea[name="instructions"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to review →' })).toBeDisabled();
  expect(statusChanges).toEqual([]);
});
}
