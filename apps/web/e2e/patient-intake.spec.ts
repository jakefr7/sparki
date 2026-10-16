import { expect, test } from '@playwright/test';
import { prisma } from '@sparki/db';
import { fixtureId } from './support/fixture-id';
import { pickClientName, pickPatientName } from './support/fixture-names';
import { cleanupFixture } from './support/cleanup-fixture';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const RUN_ID = fixtureId();

const NEW_CLIENT_NAME_PAIR = pickClientName(`patient-intake-new-client-${RUN_ID}`);
const CLIENT_FIRST_NAME = NEW_CLIENT_NAME_PAIR.firstName;
const CLIENT_LAST_NAME = NEW_CLIENT_NAME_PAIR.lastName;
const PATIENT_NAME = pickPatientName(`patient-intake-new-patient-${RUN_ID}`);

const EXISTING_CLIENT_NAME_PAIR = pickClientName(`patient-intake-existing-client-${RUN_ID}`);
const EXISTING_CLIENT_FIRST_NAME = EXISTING_CLIENT_NAME_PAIR.firstName;
const EXISTING_CLIENT_LAST_NAME = EXISTING_CLIENT_NAME_PAIR.lastName;
const EXISTING_CLIENT_PHONE = `555-01${RUN_ID.slice(-2)}`;
const EXISTING_PATIENT_NAME = pickPatientName(`patient-intake-existing-patient-${RUN_ID}`);
const EXISTING_APPOINTMENT_REASON = `Vaccination booster ${RUN_ID}`;

const NO_APPOINTMENT_CLIENT_NAME_PAIR = pickClientName(`patient-intake-no-appt-client-${RUN_ID}`);
const NO_APPOINTMENT_CLIENT_FIRST_NAME = NO_APPOINTMENT_CLIENT_NAME_PAIR.firstName;
const NO_APPOINTMENT_CLIENT_LAST_NAME = NO_APPOINTMENT_CLIENT_NAME_PAIR.lastName;

let existingClientId: string;
let noAppointmentClientId: string;
// Populated as each UI-driven test creates its own client/patient — captured
// from the resulting page/search state since these come from form
// submissions, not direct API JSON responses.
const createdPatientIds: string[] = [];
const createdClientIds: string[] = [];

test.beforeAll(async ({ request }) => {
  const clientResponse = await request.post(`${API_URL}/clients`, {
    data: {
      firstName: EXISTING_CLIENT_FIRST_NAME,
      lastName: EXISTING_CLIENT_LAST_NAME,
      phone: EXISTING_CLIENT_PHONE,
    },
  });
  expect(clientResponse.ok()).toBe(true);
  const client: { id: string } = await clientResponse.json();
  existingClientId = client.id;
  createdClientIds.push(existingClientId);

  await prisma.appointment.create({
    data: {
      organizationId: 'dev-organization',
      locationId: 'dev-location',
      clientId: existingClientId,
      type: 'Vaccination',
      reason: EXISTING_APPOINTMENT_REASON,
      source: 'Phone',
      state: 'Scheduled',
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const noAppointmentClientResponse = await request.post(`${API_URL}/clients`, {
    data: {
      firstName: NO_APPOINTMENT_CLIENT_FIRST_NAME,
      lastName: NO_APPOINTMENT_CLIENT_LAST_NAME,
      phone: `555-02${RUN_ID.slice(-2)}`,
    },
  });
  expect(noAppointmentClientResponse.ok()).toBe(true);
  const noAppointmentClient: { id: string } = await noAppointmentClientResponse.json();
  noAppointmentClientId = noAppointmentClient.id;
  createdClientIds.push(noAppointmentClientId);
});

test.afterAll(async () => {
  // The appointment created directly above is cleaned up via its clientId
  // (cleanupFixture deletes appointments/visits linked to any tracked id).
  await cleanupFixture({ patientIds: createdPatientIds, clientIds: createdClientIds });
});

test('search with no match offers patient creation; new client + new patient walk-in opens the workspace and is searchable after refresh', async ({
  page,
}) => {
  // Search finds no results. Deliberately not searching for PATIENT_NAME
  // itself: pg_trgm fuzzy matching means it could coincidentally match
  // another parallel e2e spec's fixture, so this uses the same
  // no-shared-substring gibberish query as patient-search.spec.ts's
  // empty-state test.
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Search' });
  await input.pressSequentially('qzxjvkqzxjvknonexistent');
  await expect(page.getByText(/No patients match/)).toBeVisible();

  // Offer to create a new patient.
  await page.getByRole('link', { name: 'Create New Patient' }).click();
  await expect(page).toHaveURL('/patients/new');
  await expect(page.getByRole('radio', { name: 'Walk-In' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Link Existing Appointment' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Schedule for later/ })).toBeDisabled();

  // New client (no existing match) + new patient, in one pass.
  await page.getByLabel('First name').fill(CLIENT_FIRST_NAME);
  await page.getByLabel('Last name').fill(CLIENT_LAST_NAME);
  // Phone carries the per-run uniqueness (internal field only) — the
  // visible name stays a plain realistic name, never a random suffix.
  await page.getByLabel('Phone').fill(`555-03${RUN_ID.slice(-2)}`);

  await page.getByLabel('Name', { exact: true }).fill(PATIENT_NAME);
  await page.getByLabel('Species').selectOption('Dog');
  await page.getByLabel('Sex').selectOption('Male');
  await page.getByLabel('Years', { exact: true }).fill('2');

  await page.getByLabel('Reason for visit').fill('Annual wellness check');
  // Walk-In is the default visit mode; no extra fields required.
  await page.getByRole('button', { name: 'Create Client & Patient' }).click();

  // Walk-ins return to today's operational dashboard.
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Annual wellness check').first()).toBeVisible();

  // Patient is immediately searchable after refresh. Capture its id from the
  // result link so afterAll can clean it up precisely by id.
  await page.goto('/');
  const searchInput = page.getByRole('combobox', { name: 'Search' });
  await searchInput.pressSequentially(PATIENT_NAME);
  const option = page.getByRole('option', { name: new RegExp(PATIENT_NAME) }).first();
  await expect(option).toBeVisible();
  const href = await option.getByRole('link', { name: 'Open Workspace' }).getAttribute('href');
  const patientId = href?.match(/\/patients\/([^/]+)/)?.[1];
  if (patientId) createdPatientIds.push(patientId);
});

test('existing client search collapses the new-client fields; existing client + new patient appointment opens the workspace', async ({
  page,
}) => {
  await page.goto('/patients/new');

  await page.getByLabel('Search existing client').fill(EXISTING_CLIENT_FIRST_NAME);
  const match = page.getByRole('option', {
    name: new RegExp(`${EXISTING_CLIENT_FIRST_NAME} ${EXISTING_CLIENT_LAST_NAME}`),
  });
  await expect(match).toBeVisible();
  await match.click();

  // New-client fields collapse; a selected-client summary with "Change" shows instead.
  await expect(page.getByLabel('First name')).toHaveCount(0);
  await expect(
    page.getByText(`${EXISTING_CLIENT_FIRST_NAME} ${EXISTING_CLIENT_LAST_NAME}`).first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change' })).toBeVisible();

  // Focus moves straight to the Patient section.
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();

  await page.getByLabel('Name', { exact: true }).fill(EXISTING_PATIENT_NAME);
  await page.getByLabel('Species').selectOption('Cat');
  await page.getByLabel('Sex').selectOption('Female');
  await page.getByLabel('Years', { exact: true }).fill('4');

  await page.getByLabel('Reason for visit').fill(EXISTING_APPOINTMENT_REASON);
  await expect(page.getByText('Use this when the client already has an appointment today.')).toBeVisible();
  await page.getByRole('radio', { name: 'Link Existing Appointment' }).check();
  await page
    .getByLabel(new RegExp(`Vaccination.*${EXISTING_APPOINTMENT_REASON}`))
    .check();
  await page.getByRole('button', { name: 'Create Patient' }).click();

  await expect(page).toHaveURL(/\/patients\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name: EXISTING_PATIENT_NAME })).toBeVisible();
  await expect(
    page.getByText(`${EXISTING_CLIENT_FIRST_NAME} ${EXISTING_CLIENT_LAST_NAME}`).first(),
  ).toBeVisible();
  await expect(page.getByText('Scheduled').first()).toBeVisible();
  await expect(page.getByText(EXISTING_APPOINTMENT_REASON).first()).toBeVisible();

  const patientId = page.url().match(/\/patients\/([^/]+)/)?.[1];
  if (patientId) createdPatientIds.push(patientId);
});

test('existing client with no appointment gets a clear walk-in message', async ({ page }) => {
  await page.goto('/patients/new');

  await page.getByLabel('Search existing client').fill(NO_APPOINTMENT_CLIENT_FIRST_NAME);
  const match = page.getByRole('option', {
    name: new RegExp(`${NO_APPOINTMENT_CLIENT_FIRST_NAME} ${NO_APPOINTMENT_CLIENT_LAST_NAME}`),
  });
  await expect(match).toBeVisible();
  await match.click();

  await expect(page.getByRole('radio', { name: 'Walk-In' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Link Existing Appointment' })).toBeEnabled();
  await page.getByRole('radio', { name: 'Link Existing Appointment' }).check();

  await expect(page.getByText('No appointments found today. Use Walk-In for now.')).toBeVisible();
});

test('requires the MVP client fields before creating a new client', async ({ page }) => {
  await page.goto('/patients/new');

  await page.getByLabel('Last name').fill('Missing First Name');
  await page.getByLabel('Name', { exact: true }).fill('Some Patient');
  await page.getByLabel('Reason for visit').fill('Checkup');
  await page.getByRole('button', { name: 'Create Client & Patient' }).click();

  // Native HTML5 required-field validation blocks submission (First name
  // left empty), so we're still on the intake page.
  await expect(page).toHaveURL('/patients/new');
});
