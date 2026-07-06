import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const RUN_ID = Date.now();
const CLIENT_FIRST_NAME = 'Schedule';
const CLIENT_LAST_NAME = `Client ${RUN_ID}`;
const PATIENT_NAME = `Schedule Patient ${RUN_ID}`;
const VISIT_REASON = `Wellness checkup ${RUN_ID}`;

let patientId: string;

test.beforeAll(async ({ request }) => {
  const clientResponse = await request.post(`${API_URL}/clients`, {
    data: { firstName: CLIENT_FIRST_NAME, lastName: CLIENT_LAST_NAME, phone: '555-0155' },
  });
  expect(clientResponse.ok()).toBe(true);
  const client: { id: string } = await clientResponse.json();

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
});

test('search patient, open workspace, schedule an appointment, and it persists after reload', async ({
  page,
}) => {
  // Search patient.
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Patient search' });
  await input.pressSequentially(PATIENT_NAME);
  await expect(page.getByRole('option', { name: new RegExp(PATIENT_NAME) })).toBeVisible();
  await input.press('Enter');

  // Open patient workspace.
  await expect(page).toHaveURL(`/patients/${patientId}`);
  await expect(page.getByRole('heading', { level: 1, name: PATIENT_NAME })).toBeVisible();
  await expect(page.getByText('No upcoming appointments.')).toBeVisible();

  // Create appointment.
  await page.getByRole('link', { name: 'Schedule Appointment' }).click();
  await expect(page).toHaveURL(`/patients/${patientId}/schedule`);
  await expect(page.getByRole('heading', { name: 'Schedule Appointment' })).toBeVisible();

  await page.getByLabel('Appointment type').selectOption('WellnessPreventiveCare');
  await page.getByLabel('Visit reason').fill(VISIT_REASON);
  await page.getByLabel('Start time').fill('2027-06-01T10:30');
  await page.getByLabel('Expected duration (minutes)').fill('30');
  await page.getByRole('button', { name: 'Schedule appointment' }).click();

  // Back on the workspace, appointment shows in the summary.
  await expect(page).toHaveURL(`/patients/${patientId}`);
  await expect(page.getByText(VISIT_REASON)).toBeVisible();
  await expect(page.getByText('Wellness / Preventive Care')).toBeVisible();
  await expect(page.getByText('30 min')).toBeVisible();

  // Refresh page and appointment persists.
  await page.reload();
  await expect(page.getByText(VISIT_REASON)).toBeVisible();
});

test('rejects an incomplete appointment form', async ({ page }) => {
  await page.goto(`/patients/${patientId}/schedule`);

  await page.getByLabel('Visit reason').fill('Missing start time');
  await page.getByRole('button', { name: 'Schedule appointment' }).click();

  // Native HTML5 required-field validation blocks submission (Start time
  // left empty), so we're still on the schedule page.
  await expect(page).toHaveURL(`/patients/${patientId}/schedule`);
});
