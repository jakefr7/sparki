import { expect, test } from '@playwright/test';
import { fixtureId } from './support/fixture-id';
import { pickClientName, pickPatientName } from './support/fixture-names';
import { cleanupFixture } from './support/cleanup-fixture';
import { loginAs } from './support/login';

const RUN_ID = fixtureId();
const CLIENT_NAME_PAIR = pickClientName(`new-patient-new-appointment-client-${RUN_ID}`);
const CLIENT_FIRST_NAME = CLIENT_NAME_PAIR.firstName;
const CLIENT_LAST_NAME = CLIENT_NAME_PAIR.lastName;
const PATIENT_NAME = pickPatientName(`new-patient-new-appointment-patient-${RUN_ID}`);
const CLIENT_PHONE = `555-5${RUN_ID.slice(-3)}`;

let patientId: string;
let clientId: string;

test.afterAll(async () => {
  await cleanupFixture({ patientIds: patientId ? [patientId] : [], clientIds: clientId ? [clientId] : [] });
});

test('creating a patient, then choosing New Appointment, opens the shared popup with the patient already selected', async ({
  page,
}) => {
  await loginAs(page);
  await page.goto('/patients');

  await page.getByRole('button', { name: 'New Patient' }).click();
  const newPatientDialog = page.getByRole('dialog', { name: 'New Patient' });
  await expect(newPatientDialog).toBeVisible();

  await newPatientDialog.getByLabel('First name', { exact: true }).fill(CLIENT_FIRST_NAME);
  await newPatientDialog.getByLabel('Last name', { exact: true }).fill(CLIENT_LAST_NAME);
  await newPatientDialog.getByLabel('Cell phone').fill(CLIENT_PHONE);
  await newPatientDialog.getByLabel('Patient name').fill(PATIENT_NAME);
  await newPatientDialog.getByLabel('Species').selectOption('Dog');

  const [clientResponse, patientResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/clients') && response.request().method() === 'POST',
    ),
    page.waitForResponse(
      (response) => response.url().includes('/api/patients') && response.request().method() === 'POST',
    ),
    newPatientDialog.getByRole('button', { name: 'Create Patient' }).click(),
  ]);
  expect(clientResponse.ok()).toBe(true);
  expect(patientResponse.ok()).toBe(true);
  clientId = (await clientResponse.json()).id;
  patientId = (await patientResponse.json()).id;

  // Success step — "New Appointment" replaces the old "Set Appointment" link
  // that used to navigate to the now-removed /patients/[id]/schedule route.
  await expect(newPatientDialog.getByText(`${PATIENT_NAME} has been added.`)).toBeVisible();
  await expect(newPatientDialog.getByRole('link', { name: /Set Appointment/ })).toHaveCount(0);
  await newPatientDialog.getByRole('button', { name: 'New Appointment' }).click();

  // The New Patient dialog is gone and the shared New Appointment popup
  // opened in its place — no navigation to a legacy route happened.
  await expect(newPatientDialog).toBeHidden();
  await expect(page).toHaveURL('/patients');

  const appointmentDialog = page.getByRole('dialog', { name: 'New Appointment' });
  await expect(appointmentDialog).toBeVisible();

  // Patient is already selected — no search step, and the inline "New
  // Patient" sub-form (owner/pet fields) is not shown for this patient.
  await expect(appointmentDialog.getByLabel('Search existing patient')).toHaveValue(PATIENT_NAME);
  await expect(appointmentDialog.locator('.scheduler-selected-patient')).toContainText(PATIENT_NAME);
  await expect(appointmentDialog.getByText('Pet not found? Use New Patient.')).toHaveCount(0);
  await expect(appointmentDialog.getByLabel('Patient name')).toHaveCount(0);

  await appointmentDialog.getByLabel('Appointment type').selectOption('WellnessPreventiveCare');
  const [appointmentResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/appointments') && response.request().method() === 'POST',
    ),
    appointmentDialog.getByRole('button', { name: 'Book appointment' }).click(),
  ]);
  expect(appointmentResponse.ok()).toBe(true);
  const createdAppointment: { patientId: string; clientId: string | null } = await appointmentResponse.json();
  expect(createdAppointment.patientId).toBe(patientId);
  expect(createdAppointment.clientId).toBe(clientId);

  await expect(appointmentDialog).toBeHidden();
});
