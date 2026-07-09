import { expect, test } from '@playwright/test';
import { fixtureId } from './support/fixture-id';
import { pickClientName, pickPatientName } from './support/fixture-names';
import { cleanupFixture } from './support/cleanup-fixture';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const RUN_ID = fixtureId();
const CLIENT_NAME_PAIR = pickClientName(`schedule-appointment-client-${RUN_ID}`);
const CLIENT_FIRST_NAME = CLIENT_NAME_PAIR.firstName;
const CLIENT_LAST_NAME = CLIENT_NAME_PAIR.lastName;
const PATIENT_NAME = pickPatientName(`schedule-appointment-patient-${RUN_ID}`);
const VISIT_REASON = `Wellness checkup ${RUN_ID}`;

let patientId: string;
let clientId: string;

test.beforeAll(async ({ request }) => {
  const clientResponse = await request.post(`${API_URL}/clients`, {
    // Phone carries the per-run uniqueness (internal field only) — the
    // visible name stays a plain realistic name, never a random suffix.
    data: { firstName: CLIENT_FIRST_NAME, lastName: CLIENT_LAST_NAME, phone: `555-0${RUN_ID.slice(-3)}` },
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
});

test.afterAll(async () => {
  await cleanupFixture({ patientIds: [patientId], clientIds: [clientId] });
});

test('search patient, open workspace, schedule an appointment, and it persists after reload', async ({
  page,
}) => {
  // Search patient.
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Search' });
  await input.pressSequentially(PATIENT_NAME);
  // Click the exact match rather than pressing Enter: fuzzy ranking against
  // the shared dev DB's accumulated fixtures can put another result first.
  const option = page.getByRole('option', { name: new RegExp(PATIENT_NAME) });
  await expect(option).toBeVisible();
  // Click the identity block, not the action buttons area, which stops
  // propagation so it doesn't trigger the option's own click handler.
  await option.locator('.patient-search__identity').click();

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

  // Back on the workspace, appointment shows in the Upcoming Appointments summary.
  await expect(page).toHaveURL(`/patients/${patientId}`);
  const upcomingAppointments = page.getByRole('region', { name: 'Upcoming Appointments' });
  await expect(upcomingAppointments).toContainText(VISIT_REASON);
  await expect(upcomingAppointments).toContainText('Wellness / Preventive Care');
  await expect(upcomingAppointments).toContainText('30 min');

  // Refresh page and appointment persists.
  await page.reload();
  await expect(upcomingAppointments).toContainText(VISIT_REASON);
});

test('rejects an incomplete appointment form', async ({ page }) => {
  await page.goto(`/patients/${patientId}/schedule`);

  await page.getByLabel('Visit reason').fill('Missing start time');
  await page.getByRole('button', { name: 'Schedule appointment' }).click();

  // Native HTML5 required-field validation blocks submission (Start time
  // left empty), so we're still on the schedule page.
  await expect(page).toHaveURL(`/patients/${patientId}/schedule`);
});
