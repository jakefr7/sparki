import { expect, test } from '@playwright/test';
import { cleanupFixture } from './support/cleanup-fixture';
import { fixtureId } from './support/fixture-id';
import { pickClientName, pickPatientName } from './support/fixture-names';
import { loginAs } from './support/login';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const RUN_ID = fixtureId();
const CLIENT_NAME_PAIR = pickClientName(`patient-profile-polish-client-${RUN_ID}`);
const PATIENT_NAME = pickPatientName(`patient-profile-polish-patient-${RUN_ID}`);

let patientId: string;
let clientId: string;

test.beforeAll(async ({ request }) => {
  const clientResponse = await request.post(`${API_URL}/clients`, {
    data: {
      firstName: CLIENT_NAME_PAIR.firstName,
      lastName: CLIENT_NAME_PAIR.lastName,
      phone: `555-2${RUN_ID.slice(-3)}`,
    },
  });
  expect(clientResponse.ok()).toBe(true);
  const client: { id: string } = await clientResponse.json();
  clientId = client.id;

  const patientResponse = await request.post(`${API_URL}/patients`, {
    data: {
      name: PATIENT_NAME,
      species: 'Canine',
      breed: 'Beagle',
      clients: [{ clientId, isPrimary: true }],
    },
  });
  expect(patientResponse.ok()).toBe(true);
  const patient: { id: string } = await patientResponse.json();
  patientId = patient.id;

  const visitResponse = await request.post(`${API_URL}/visits`, {
    data: {
      patientId,
      reason: 'Vaccine booster appointment',
      visitType: 'Scheduled',
    },
  });
  expect(visitResponse.ok()).toBe(true);
});

test.afterAll(async () => {
  await cleanupFixture({ patientIds: [patientId], clientIds: [clientId] });
});

test('patient profile manages care alerts and medications end to end', async ({ page }) => {
  await loginAs(page);
  await page.goto(`/patients/${patientId}`);
  await expect(page.getByRole('heading', { level: 1, name: PATIENT_NAME })).toBeVisible();
  await expect(page.locator('.patient-profile-hero__badges')).toContainText('Active');
  await expect(page.getByRole('heading', { name: 'Current Visit' })).toBeVisible();
  await expect(page.getByLabel('Clinical summary')).toContainText('No active medications');
  await page.getByRole('button', { name: 'View Visit' }).first().click();
  const currentVisitDialog = page.getByRole('dialog', { name: 'Vaccine booster appointment' });
  await expect(currentVisitDialog).toBeVisible();
  await expect(currentVisitDialog).toContainText('Current Visit');
  await expect(currentVisitDialog).toContainText('Client');
  await expect(currentVisitDialog).toContainText('Doctor');
  await currentVisitDialog.getByRole('button', { name: 'Close active visit details' }).click();
  await expect(currentVisitDialog).toBeHidden();

  await page.getByRole('tab', { name: 'Alerts' }).click();
  await expect(page.getByText('No active alerts')).toBeVisible();
  await page.getByRole('button', { name: 'Add Alert' }).first().click();
  await page.getByLabel('Alert text').fill('Caution handling - owner reports biting when nervous');
  await page.getByLabel('Category').selectOption('Behavior');
  await page.getByLabel('Severity').selectOption('Critical');
  await page.getByRole('button', { name: 'Add alert', exact: true }).click();

  await expect(page.locator('.patient-profile-hero__alert')).toContainText(
    'Caution handling - owner reports biting when nervous',
  );
  await page.getByRole('tab', { name: 'Alerts' }).click();
  await expect(page.locator('.patient-alert-card')).toContainText('Critical');
  await page.locator('.patient-alert-card').getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Alert text').fill('Barks during nail trims');
  await page.getByRole('button', { name: 'Save alert' }).click();
  await expect(page.locator('.patient-profile-hero__alert')).toContainText('Barks during nail trims');
  await page.getByRole('tab', { name: 'Alerts' }).click();
  await page.locator('.patient-alert-card').getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('No active alerts')).toBeVisible();

  await page.getByRole('tab', { name: 'Medications' }).click();
  await expect(page.getByText('No active medications on file', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Medication' }).first().click();
  await page.getByLabel('Medication name').fill('Gab');
  await expect(page.getByRole('option', { name: 'Gabapentin' })).toHaveCount(1);
  await page.getByLabel('Medication name').fill('Custom compounded drops');
  await page.getByLabel('Dose').fill('2 drops');
  await page.getByLabel('Frequency').fill('Daily');
  await page.getByLabel('Instructions').fill('Give with breakfast');
  await page.getByRole('button', { name: 'Add medication', exact: true }).click();

  await expect(page.locator('.patient-medication-card')).toContainText('Custom compounded drops');
  await expect(page.locator('.patient-medication-card')).toContainText('Active');
  await page.locator('.patient-medication-card').getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Medication name').fill('Gabapentin');
  await page.getByLabel('Route').fill('Oral');
  await page.getByRole('button', { name: 'Save medication' }).click();
  await expect(page.locator('.patient-medication-card')).toContainText('Gabapentin');
  await expect(page.locator('.patient-medication-card')).toContainText('Oral');

  await page.locator('.patient-medication-card').getByRole('button', { name: 'Discontinue' }).click();
  await expect(page.getByRole('heading', { name: 'Past / discontinued' }).locator('..')).toContainText('Gabapentin');
  await expect(page.getByRole('heading', { name: 'Active medications' }).locator('..')).toContainText(
    'No active medications.',
  );
});
