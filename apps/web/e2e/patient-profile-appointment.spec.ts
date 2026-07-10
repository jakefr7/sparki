import { expect, test } from '@playwright/test';
import { fixtureId } from './support/fixture-id';
import { pickClientName, pickPatientName } from './support/fixture-names';
import { cleanupFixture } from './support/cleanup-fixture';
import { loginAs } from './support/login';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const RUN_ID = fixtureId();
const CLIENT_NAME_PAIR = pickClientName(`patient-profile-appointment-client-${RUN_ID}`);
const CLIENT_FIRST_NAME = CLIENT_NAME_PAIR.firstName;
const CLIENT_LAST_NAME = CLIENT_NAME_PAIR.lastName;
const PATIENT_NAME = pickPatientName(`patient-profile-appointment-patient-${RUN_ID}`);

let patientId: string;
let clientId: string;

test.beforeAll(async ({ request }) => {
  const clientResponse = await request.post(`${API_URL}/clients`, {
    data: { firstName: CLIENT_FIRST_NAME, lastName: CLIENT_LAST_NAME, phone: `555-1${RUN_ID.slice(-3)}` },
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

test('Set Appointment on the patient profile opens the modal with the patient already selected', async ({
  page,
}) => {
  await loginAs(page);
  await page.goto(`/patients/${patientId}`);
  await expect(page.getByRole('heading', { level: 1, name: PATIENT_NAME })).toBeVisible();

  await page.getByRole('button', { name: 'Set Appointment' }).click();

  const dialog = page.getByRole('dialog', { name: 'New Appointment' });
  await expect(dialog).toBeVisible();

  // The patient is pre-selected — no search/select step is required. The
  // search box is pre-filled with the patient's name and the selected-patient
  // summary is already showing, rather than the "Pet not found?" empty hint.
  await expect(dialog.getByLabel('Search existing patient')).toHaveValue(PATIENT_NAME);
  await expect(dialog.locator('.scheduler-selected-patient')).toContainText(PATIENT_NAME);
  await expect(dialog.getByText('Pet not found? Use New Patient.')).toHaveCount(0);

  // Complete the booking to confirm the prefilled patient actually flows
  // through to a real appointment.
  await dialog.getByLabel('Appointment type').selectOption('WellnessPreventiveCare');
  await dialog.getByRole('button', { name: 'Book appointment' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Upcoming Appointment')).toBeVisible();
  await expect(page.getByLabel('Care Status').getByText('Wellness / Preventive Care')).toBeVisible();
});
