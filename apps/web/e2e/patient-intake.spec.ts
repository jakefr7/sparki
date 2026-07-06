import { expect, test } from '@playwright/test';

const RUN_ID = Date.now();
const CLIENT_FIRST_NAME = 'Intake';
const CLIENT_LAST_NAME = `Client ${RUN_ID}`;
const PATIENT_NAME = `Intake Patient ${RUN_ID}`;

test('search with no match offers patient creation; creating a client and patient opens the workspace and the patient is searchable after refresh', async ({
  page,
}) => {
  // Search finds no results. Deliberately not searching for PATIENT_NAME
  // itself: pg_trgm fuzzy matching means it could coincidentally match
  // another parallel e2e spec's "... Patient <timestamp>" fixture, so this
  // uses the same no-shared-substring gibberish query as
  // patient-search.spec.ts's empty-state test.
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Patient search' });
  await input.pressSequentially('qzxjvkqzxjvknonexistent');
  await expect(page.getByText(/No patients match/)).toBeVisible();

  // Offer to create a new patient.
  await page.getByRole('link', { name: 'Create New Patient' }).click();
  await expect(page).toHaveURL('/patients/new');
  await expect(page.getByRole('heading', { name: 'Create New Patient' })).toBeVisible();

  // Step 1: Create Client (MVP fields only).
  await expect(page.getByText('Step 1 of 2: Client')).toBeVisible();
  await page.getByLabel('First name').fill(CLIENT_FIRST_NAME);
  await page.getByLabel('Last name').fill(CLIENT_LAST_NAME);
  await page.getByLabel('Mobile phone').fill('555-0199');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2: Create Patient (MVP fields only).
  await expect(page.getByText('Step 2 of 2: Patient')).toBeVisible();
  await expect(page.getByText(`Owner: ${CLIENT_FIRST_NAME} ${CLIENT_LAST_NAME}`)).toBeVisible();

  await page.getByLabel('Patient name').fill(PATIENT_NAME);
  await page.getByLabel('Species').selectOption('Dog');
  await page.getByLabel('Sex').selectOption('Male');
  await page.getByLabel('Approximate age in years').fill('2');
  await page.getByRole('button', { name: 'Create Patient' }).click();

  // Patient Workspace opens for the newly created patient.
  await expect(page).toHaveURL(/\/patients\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name: PATIENT_NAME })).toBeVisible();
  await expect(page.getByText(`${CLIENT_FIRST_NAME} ${CLIENT_LAST_NAME}`)).toBeVisible();
  await expect(page.getByText(/Dog/)).toBeVisible();

  // Patient is immediately searchable after refresh.
  await page.goto('/');
  const searchInput = page.getByRole('combobox', { name: 'Patient search' });
  await searchInput.pressSequentially(PATIENT_NAME);
  await expect(page.getByRole('option', { name: new RegExp(PATIENT_NAME) })).toBeVisible();
});

test('requires the MVP client fields before continuing to patient creation', async ({ page }) => {
  await page.goto('/patients/new');

  await page.getByLabel('Last name').fill('Missing First Name');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Native HTML5 required-field validation blocks submission (First name
  // left empty), so we're still on step 1.
  await expect(page.getByText('Step 1 of 2: Client')).toBeVisible();
});
