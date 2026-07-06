import { expect, test } from '@playwright/test';
import { prisma } from '../../../packages/db/src/client';
import { fixtureId } from './support/fixture-id';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const RUN_ID = fixtureId();
const CLIENT_FIRST_NAME = 'Intake';
const CLIENT_LAST_NAME = `Client ${RUN_ID}`;
const PATIENT_NAME = `Intake Patient ${RUN_ID}`;

const EXISTING_CLIENT_FIRST_NAME = 'ExistingIntake';
const EXISTING_CLIENT_LAST_NAME = `Client ${RUN_ID}`;
const EXISTING_CLIENT_PHONE = `555-01${RUN_ID.slice(-2)}`;
const EXISTING_PATIENT_NAME = `Existing Intake Patient ${RUN_ID}`;
const EXISTING_APPOINTMENT_REASON = `Vaccination booster ${RUN_ID}`;

let existingClientId: string;

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
});

test('search with no match offers patient creation; new client + new patient walk-in opens the workspace and is searchable after refresh', async ({
  page,
}) => {
  // Search finds no results. Deliberately not searching for PATIENT_NAME
  // itself: pg_trgm fuzzy matching means it could coincidentally match
  // another parallel e2e spec's "... Patient <timestamp>" fixture, so this
  // uses the same no-shared-substring gibberish query as
  // patient-search.spec.ts's empty-state test.
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Search' });
  await input.pressSequentially('qzxjvkqzxjvknonexistent');
  await expect(page.getByText(/No patients match/)).toBeVisible();

  // Offer to create a new patient.
  await page.getByRole('link', { name: 'Create New Patient' }).click();
  await expect(page).toHaveURL('/patients/new');

  // New client (no existing match) + new patient, in one pass.
  await page.getByLabel('First name').fill(CLIENT_FIRST_NAME);
  await page.getByLabel('Last name').fill(CLIENT_LAST_NAME);
  await page.getByLabel('Phone').fill('555-0199');

  await page.getByLabel('Name', { exact: true }).fill(PATIENT_NAME);
  await page.getByLabel('Species').selectOption('Dog');
  await page.getByLabel('Sex').selectOption('Male');
  await page.getByLabel('Age (years)').fill('2');

  await page.getByLabel('Reason for visit').fill('Annual wellness check');
  // Walk-In is the default visit mode; no extra fields required.
  await page.getByRole('button', { name: 'Create Client & Patient' }).click();

  // Walk-ins return to today's operational dashboard.
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Annual wellness check').first()).toBeVisible();

  // Patient is immediately searchable after refresh. Match by the result's
  // link (patient id), not display text: search results run display names
  // through cleanDisplayName, which strips 8+ digit runs — including this
  // test's timestamp-suffixed fixture name.
  await page.goto('/');
  const searchInput = page.getByRole('combobox', { name: 'Search' });
  await searchInput.pressSequentially(PATIENT_NAME);
  await expect(page.getByRole('option', { name: /Intake Patient/ }).first()).toBeVisible();
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
  await page.getByLabel('Age (years)').fill('4');

  await page.getByLabel('Reason for visit').fill(EXISTING_APPOINTMENT_REASON);
  await page.getByRole('radio', { name: 'Scheduled Appointment' }).check();
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
