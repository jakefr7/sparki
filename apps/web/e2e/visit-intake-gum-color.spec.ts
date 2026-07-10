import { expect, test } from '@playwright/test';
import { fixtureId } from './support/fixture-id';
import { pickClientName, pickPatientName } from './support/fixture-names';
import { cleanupFixture } from './support/cleanup-fixture';
import { loginAs } from './support/login';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const RUN_ID = fixtureId();
const CLIENT_NAME_PAIR = pickClientName(`visit-intake-gum-color-client-${RUN_ID}`);
const PATIENT_NAME = pickPatientName(`visit-intake-gum-color-patient-${RUN_ID}`);

let patientId: string;
let clientId: string;
let visitId: string;

test.beforeAll(async ({ request }) => {
  const clientResponse = await request.post(`${API_URL}/clients`, {
    data: {
      firstName: CLIENT_NAME_PAIR.firstName,
      lastName: CLIENT_NAME_PAIR.lastName,
      phone: `555-5${RUN_ID.slice(-3)}`,
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
      clients: [{ clientId: client.id, isPrimary: true }],
    },
  });
  expect(patientResponse.ok()).toBe(true);
  const patient: { id: string } = await patientResponse.json();
  patientId = patient.id;

  // Walk-in Visit, then move it into IntakeInProgress — the intake form
  // only renders while a Visit is in that state (see visit-intake-panel.tsx).
  const visitResponse = await request.post(`${API_URL}/visits`, {
    data: { patientId, reason: 'Weight unit and gum color intake fixture' },
  });
  expect(visitResponse.ok()).toBe(true);
  const visit: { id: string } = await visitResponse.json();
  visitId = visit.id;

  const startResponse = await request.post(`${API_URL}/visits/${visitId}/start`);
  expect(startResponse.ok()).toBe(true);
});

test.afterAll(async () => {
  await cleanupFixture({ patientIds: [patientId], clientIds: [clientId] });
});

test('tech/assistant can record weight in either unit and gum color during intake, and both persist on reload', async ({
  page,
}) => {
  // Anna's documented flow: this is a tech/assistant task, not vet-only.
  await loginAs(page, 'testtech@gmail.com');
  await page.goto(`/visits/${visitId}`);

  const weightField = page.getByLabel('Weight', { exact: true });
  const weightUnitField = page.getByLabel('Weight unit');
  const gumColorField = page.getByLabel('Gum color');
  await expect(weightField).toBeVisible();
  await expect(weightUnitField).toBeVisible();
  await expect(gumColorField).toBeVisible();

  // Weight unit defaults to lb (never silently kg) for a fresh intake.
  await expect(weightUnitField).toHaveValue('LB');

  // Save in kg first.
  await weightField.fill('19.3');
  await weightUnitField.selectOption('KG');
  await gumColorField.selectOption('Pink');
  await page.getByRole('button', { name: 'Save New Visit' }).click();

  const summary = page.locator('.visit-intake-summary');
  await expect(summary).toContainText('19.3 kg');
  await expect(summary).toContainText('Gums: Pink');

  await page.reload();
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue('19.3');
  await expect(page.getByLabel('Weight unit')).toHaveValue('KG');
  await expect(page.locator('.visit-intake-summary')).toContainText('19.3 kg');
  await expect(page.locator('.visit-intake-summary')).toContainText('Gums: Pink');

  // Now switch to lb and confirm the summary follows the selected unit,
  // not a hardcoded one.
  await page.getByLabel('Weight', { exact: true }).fill('42.5');
  await page.getByLabel('Weight unit').selectOption('LB');
  await page.getByRole('button', { name: 'Save New Visit' }).click();

  await expect(page.locator('.visit-intake-summary')).toContainText('42.5 lb');

  await page.reload();
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue('42.5');
  await expect(page.getByLabel('Weight unit')).toHaveValue('LB');
  await expect(page.locator('.visit-intake-summary')).toContainText('42.5 lb');
  await expect(page.locator('.visit-intake-summary')).toContainText('Gums: Pink');
});
