import { expect, test } from '@playwright/test';
import { fixtureId } from './support/fixture-id';
import { makeTypo, pickClientName, pickPatientName } from './support/fixture-names';
import { cleanupFixture } from './support/cleanup-fixture';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const RUN_ID = fixtureId();
const CLIENT_NAME_PAIR = pickClientName(`patient-search-client-${RUN_ID}`);
const CLIENT_FIRST_NAME = CLIENT_NAME_PAIR.firstName;
const CLIENT_LAST_NAME = CLIENT_NAME_PAIR.lastName;
const CLIENT_NAME = `${CLIENT_FIRST_NAME} ${CLIENT_LAST_NAME}`;
const PATIENT_NAME = pickPatientName(`patient-search-patient-${RUN_ID}`);
const PATIENT_DISPLAY_NAME = PATIENT_NAME;

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

test('search input is focused on load (keyboard-first landing)', async ({ page }) => {
  await page.goto('/patients');
  await expect(page.getByRole('combobox', { name: 'Search' })).toBeFocused();
});

test('typing a patient name, navigating with arrow keys, and opening with Enter reaches the workspace', async ({
  page,
}) => {
  await page.goto('/patients');

  const input = page.getByRole('combobox', { name: 'Search' });
  await input.pressSequentially(PATIENT_NAME);

  const option = page.getByRole('option', { name: new RegExp(PATIENT_DISPLAY_NAME) }).first();
  await expect(option).toBeVisible();

  // Keyboard-only: move down then back up, then open with Enter.
  await input.press('ArrowDown');
  await input.press('ArrowUp');
  await input.press('Enter');

  await expect(page).toHaveURL(`/patients/${patientId}`);
  await expect(page.getByRole('heading', { level: 1, name: PATIENT_NAME })).toBeVisible();
  await expect(page.getByText(CLIENT_NAME)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current Visit' })).toBeVisible();
  await expect(page.getByText('No appointment or active visit on deck')).toBeVisible();
});

test('search result shows operational context and next actions', async ({ page }) => {
  await page.goto('/patients');

  const input = page.getByRole('combobox', { name: 'Search' });
  await input.pressSequentially(PATIENT_NAME);

  const option = page.getByRole('option', { name: new RegExp(PATIENT_DISPLAY_NAME) }).first();
  await expect(option).toBeVisible();
  await expect(option.getByText('No Visit Today')).toBeVisible();
  await expect(option.getByRole('link', { name: 'Open Workspace' })).toBeVisible();
  await expect(option.getByRole('button', { name: 'Create Walk-In Visit' })).toBeVisible();
});

test('tolerates a typo via fuzzy search', async ({ page }) => {
  await page.goto('/patients');
  const typo = makeTypo(PATIENT_NAME);

  const input = page.getByRole('combobox', { name: 'Search' });
  await input.pressSequentially(typo);

  await expect(
    page.getByRole('option', { name: new RegExp(PATIENT_DISPLAY_NAME) }).first(),
  ).toBeVisible();
});

test('shows an explicit empty state when nothing matches', async ({ page }) => {
  await page.goto('/patients');
  const input = page.getByRole('combobox', { name: 'Search' });
  await input.pressSequentially('qzxjvkqzxjvknonexistent');

  await expect(page.getByText(/No patients match/)).toBeVisible();
});

test('"/" refocuses search after focus moves away (keyboard-first shortcut)', async ({ page }) => {
  await page.goto('/patients');
  const input = page.getByRole('combobox', { name: 'Search' });

  await page.locator('.app-brand').click();
  await expect(input).not.toBeFocused();

  await page.keyboard.press('/');
  await expect(input).toBeFocused();
});

test('search results render within the action-acknowledgement performance budget', async ({
  page,
}) => {
  await page.goto('/patients');
  const input = page.getByRole('combobox', { name: 'Search' });

  const start = Date.now();
  await input.pressSequentially(PATIENT_NAME);
  await expect(
    page.getByRole('option', { name: new RegExp(PATIENT_DISPLAY_NAME) }).first(),
  ).toBeVisible();
  const elapsed = Date.now() - start;

  // Closest documented budget is the workspace spec's 300ms "action
  // acknowledgement" target; this measures typing-to-visible-result, which
  // also includes the deliberate 150ms debounce, so allow generous headroom
  // to avoid CI flakiness while still catching real regressions.
  expect(elapsed).toBeLessThan(1500);
});
