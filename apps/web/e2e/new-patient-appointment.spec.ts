import { expect, test, type Page } from '@playwright/test';
import { fixtureId } from './support/fixture-id';
import { pickClientName, pickPatientName } from './support/fixture-names';
import { cleanupFixture } from './support/cleanup-fixture';
import { loginAs } from './support/login';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const RUN_ID = fixtureId();

// An "existing" client already on file, used only to trigger the duplicate
// advisory hint — never asserted against by name matching in the UI beyond
// what the hint itself surfaces.
const EXISTING_CLIENT_NAME = pickClientName(`new-patient-appointment-existing-${RUN_ID}`);
const EXISTING_CLIENT_PHONE = `555-2${RUN_ID.slice(-3)}`;

// The client/patient the test actually creates through the "New Patient" form.
const NEW_CLIENT_NAME = pickClientName(`new-patient-appointment-new-${RUN_ID}`);
const NEW_PATIENT_NAME = pickPatientName(`new-patient-appointment-patient-${RUN_ID}`);
const NEW_CLIENT_PHONE = `555-3${RUN_ID.slice(-3)}`;

// Shared across every test in this file (created once) — cleaned in
// afterAll, since it isn't a per-test row.
/** YYYY-MM-DD for the `type="date"` field, in the browser's local calendar
 *  day — matches new-appointment-modal.tsx's own formatDateInput(). */
function todayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let existingClientId: string;

// Rows an individual test creates itself are tracked here and cleaned
// immediately in afterEach, not deferred to the end of the file. This keeps
// the blast radius of an interrupted run to at most one test's fixtures
// instead of the whole file's — see cleanup-fixture.ts.
let testClientIds: string[] = [];
let testPatientIds: string[] = [];

test.beforeAll(async ({ request }) => {
  const existingClientResponse = await request.post(`${API_URL}/clients`, {
    data: {
      firstName: EXISTING_CLIENT_NAME.firstName,
      lastName: EXISTING_CLIENT_NAME.lastName,
      phone: EXISTING_CLIENT_PHONE,
    },
  });
  expect(existingClientResponse.ok()).toBe(true);
  const existingClient: { id: string } = await existingClientResponse.json();
  existingClientId = existingClient.id;
});

test.afterAll(async () => {
  await cleanupFixture({ clientIds: [existingClientId] });
});

test.afterEach(async () => {
  await cleanupFixture({ patientIds: testPatientIds, clientIds: testClientIds });
  testClientIds = [];
  testPatientIds = [];
});

async function openNewAppointmentModal(page: Page) {
  await page.goto('/scheduler');
  await page.getByRole('button', { name: /New appointment at/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New Appointment' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('scheduler visible copy says "New Patient," not "New Client / New Patient"', async ({ page }) => {
  await loginAs(page);
  const dialog = await openNewAppointmentModal(page);

  await expect(dialog.getByRole('button', { name: 'New Patient' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Existing Patient' })).toBeVisible();
  await expect(dialog.getByText('New Client / New Patient')).toHaveCount(0);
  await expect(dialog.getByText('New client / patient')).toHaveCount(0);
  await expect(dialog.getByText('New client/new patient')).toHaveCount(0);
});

test('"New Patient" form captures owner, address, patient, appointment, and records-request fields; saves via the combined endpoint; warns on a possible duplicate client', async ({
  page,
  request,
}) => {
  await loginAs(page);
  const dialog = await openNewAppointmentModal(page);

  await dialog.getByRole('button', { name: 'New Patient' }).click();

  // Owner information.
  await expect(dialog.getByLabel('First name')).toBeVisible();
  await expect(dialog.getByLabel('Last name')).toBeVisible();
  await expect(dialog.getByLabel('Phone number')).toBeVisible();
  await expect(dialog.getByLabel('Email')).toBeVisible();

  // Owner address (Pass 1).
  await expect(dialog.getByLabel('Address line 1')).toBeVisible();
  await expect(dialog.getByLabel('Address line 2')).toBeVisible();
  await expect(dialog.getByLabel('City')).toBeVisible();
  await expect(dialog.getByLabel('State')).toBeVisible();
  await expect(dialog.getByLabel('ZIP/postal code')).toBeVisible();
  await expect(dialog.getByLabel('Country')).toBeVisible();

  // Patient information.
  await expect(dialog.getByLabel('Patient name')).toBeVisible();
  await expect(dialog.getByLabel('Species')).toBeVisible();

  // Appointment information (top section, already present pre-Pass-2).
  await expect(dialog.getByLabel('Appointment date')).toBeVisible();
  await expect(dialog.getByLabel('Appointment type')).toBeVisible();

  // Records-request fields (Pass 2).
  await expect(dialog.getByLabel('Primary care vet')).toBeVisible();
  await expect(dialog.getByLabel('Previous clinic')).toBeVisible();
  await expect(dialog.getByLabel('Records source')).toBeVisible();
  await expect(dialog.getByLabel('Date/time last seen')).toBeVisible();

  // Typing the existing client's phone number surfaces the advisory hint.
  await dialog.getByLabel('Phone number').fill(EXISTING_CLIENT_PHONE);
  await expect(dialog.getByText('Possible existing client found')).toBeVisible();

  // Clearing it for genuinely new contact info makes the hint go away.
  await dialog.getByLabel('Phone number').fill(NEW_CLIENT_PHONE);
  await expect(dialog.getByText('Possible existing client found')).toHaveCount(0);

  await dialog.getByLabel('First name').fill(NEW_CLIENT_NAME.firstName);
  await dialog.getByLabel('Last name').fill(NEW_CLIENT_NAME.lastName);
  await dialog.getByLabel('Email').fill(`${RUN_ID}@example.com`);
  await dialog.getByLabel('Address line 1').fill('742 Evergreen Terrace');
  await dialog.getByLabel('City').fill('Springfield');
  await dialog.getByLabel('State').fill('IL');
  await dialog.getByLabel('ZIP/postal code').fill('62704');
  await dialog.getByLabel('Country').fill('USA');

  await dialog.getByLabel('Patient name').fill(NEW_PATIENT_NAME);
  await dialog.getByLabel('Species').selectOption('Dog');

  await dialog.getByLabel('Primary care vet').fill('Dr. Adams');
  await dialog.getByLabel('Previous clinic').fill('Maple Street Animal Hospital');
  await dialog.getByLabel('Records source').fill('Will fax records');
  await dialog.getByLabel('Date/time last seen').fill('2027-01-10T12:00');

  // Book at a fixed, known-clinic-hours time instead of leaving the modal's
  // "now" default in place — after hours, "now" can fall outside the window
  // /today renders, making the visibility assertion below time-of-day
  // flaky. 10:00 AM sits in the same morning stretch the seeded demo
  // appointments occupy (8:00-9:30 AM), which /today reliably shows.
  await dialog.getByLabel('Appointment date').fill(todayDateInputValue());
  await dialog.getByLabel('Start time').fill('10:00');

  const [newPatientResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/appointments/new-patient') && response.request().method() === 'POST',
    ),
    dialog.getByRole('button', { name: 'Book appointment' }).click(),
  ]);
  expect(newPatientResponse.ok()).toBe(true);
  const created: { id: string } = await newPatientResponse.json();

  await expect(dialog).toBeHidden();

  // Confirm the combined endpoint actually created the Client with the
  // entered address, and the Appointment with the records-request fields —
  // not just that the form accepted the input.
  const searchResponse = await request.get(
    `${API_URL}/clients/search?query=${encodeURIComponent(NEW_CLIENT_PHONE)}`,
  );
  expect(searchResponse.ok()).toBe(true);
  const matches: { id: string }[] = await searchResponse.json();
  expect(matches.length).toBeGreaterThan(0);
  const createdClientId = matches[0]!.id;
  testClientIds.push(createdClientId);

  const clientResponse = await request.get(`${API_URL}/clients/${createdClientId}`);
  expect(clientResponse.ok()).toBe(true);
  const createdClient: {
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } = await clientResponse.json();
  expect(createdClient.addressLine1).toBe('742 Evergreen Terrace');
  expect(createdClient.city).toBe('Springfield');
  expect(createdClient.state).toBe('IL');
  expect(createdClient.postalCode).toBe('62704');
  expect(createdClient.country).toBe('USA');

  const appointmentResponse = await request.get(`${API_URL}/appointments/${created.id}`);
  expect(appointmentResponse.ok()).toBe(true);
  const createdAppointment: {
    patientId: string;
    primaryCareVetName: string | null;
    previousClinicName: string | null;
    previousRecordsSource: string | null;
    lastSeenAt: string | null;
  } = await appointmentResponse.json();
  expect(createdAppointment.primaryCareVetName).toBe('Dr. Adams');
  expect(createdAppointment.previousClinicName).toBe('Maple Street Animal Hospital');
  expect(createdAppointment.previousRecordsSource).toBe('Will fax records');
  // The datetime-local input has no timezone of its own — the browser
  // interprets "2027-01-10T12:00" in its local timezone, same as `new
  // Date('2027-01-10T12:00')` here (no trailing "Z").
  expect(new Date(createdAppointment.lastSeenAt!).getTime()).toBe(new Date('2027-01-10T12:00').getTime());
  testPatientIds.push(createdAppointment.patientId);

  // Visible on Today after creation.
  await page.goto('/today');
  await expect(page.getByText(NEW_PATIENT_NAME).first()).toBeVisible();
});

test('failed "New Patient" save shows friendly, clinic-facing error copy', async ({ page }) => {
  await loginAs(page);
  const dialog = await openNewAppointmentModal(page);
  await dialog.getByRole('button', { name: 'New Patient' }).click();

  // Force the combined endpoint to fail server-side so the error path
  // renders without depending on a specific real backend failure mode.
  await page.route('**/api/appointments/new-patient', (route) => route.fulfill({ status: 500, body: '{}' }));

  await dialog.getByLabel('First name').fill('Temp');
  await dialog.getByLabel('Last name').fill('Owner');
  await dialog.getByLabel('Patient name').fill('Temp Pet');

  await dialog.getByRole('button', { name: 'Book appointment' }).click();

  const alert = dialog.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toHaveText(
    'We could not create this appointment. No new patient was saved. Please try again.',
  );
  await expect(alert).not.toContainText('patientId');
  await expect(alert).not.toContainText('Prisma');
  await expect(alert).not.toContainText('mutation');
});

test('existing-patient scheduling from the scheduler still works', async ({ page, request }) => {
  const clientResponse = await request.post(`${API_URL}/clients`, {
    data: {
      firstName: EXISTING_CLIENT_NAME.firstName,
      lastName: EXISTING_CLIENT_NAME.lastName,
      phone: `555-4${RUN_ID.slice(-3)}`,
    },
  });
  const client: { id: string } = await clientResponse.json();
  const patientName = pickPatientName(`new-patient-appointment-existing-flow-${RUN_ID}`);
  const patientResponse = await request.post(`${API_URL}/patients`, {
    data: { name: patientName, species: 'Canine', clients: [{ clientId: client.id, isPrimary: true }] },
  });
  const patient: { id: string } = await patientResponse.json();
  testClientIds.push(client.id);
  testPatientIds.push(patient.id);

  await loginAs(page);
  const dialog = await openNewAppointmentModal(page);

  // Disambiguate by owner last name too — the small fixture-name pool can
  // collide with an unrelated seeded patient of the same pet name.
  await dialog.getByLabel('Search existing patient').fill(patientName);
  const result = dialog
    .getByRole('button')
    .filter({ hasText: patientName })
    .filter({ hasText: EXISTING_CLIENT_NAME.lastName });
  await expect(result).toBeVisible();
  await result.click();
  await expect(dialog.locator('.scheduler-selected-patient')).toContainText(patientName);

  await dialog.getByRole('button', { name: 'Book appointment' }).click();
  await expect(dialog).toBeHidden();
});
