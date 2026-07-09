import { expect, test, type APIRequestContext } from '@playwright/test';
import { fixtureId } from './support/fixture-id';
import { pickClientName, pickPatientName } from './support/fixture-names';
import { cleanupFixture } from './support/cleanup-fixture';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const RUN_ID = fixtureId();

const createdPatientIds: string[] = [];
const createdClientIds: string[] = [];

test.afterAll(async () => {
  await cleanupFixture({ patientIds: createdPatientIds, clientIds: createdClientIds });
});

async function createPatient(request: APIRequestContext, suffix: string) {
  const clientNamePair = pickClientName(`visit-creation-client-${suffix}-${RUN_ID}`);
  const clientResponse = await request.post(`${API_URL}/clients`, {
    data: {
      firstName: clientNamePair.firstName,
      lastName: clientNamePair.lastName,
      // Phone carries the per-run uniqueness (internal field only) — the
      // visible name stays a plain realistic name, never a random suffix.
      phone: `555-0${RUN_ID.slice(-3)}`,
    },
  });
  expect(clientResponse.ok()).toBe(true);
  const client: { id: string } = await clientResponse.json();
  createdClientIds.push(client.id);

  const patientResponse = await request.post(`${API_URL}/patients`, {
    data: {
      name: pickPatientName(`visit-creation-patient-${suffix}-${RUN_ID}`),
      species: 'Canine',
      breed: 'Spaniel',
      clients: [{ clientId: client.id, isPrimary: true }],
    },
  });
  expect(patientResponse.ok()).toBe(true);
  const patient: { id: string; name: string } = await patientResponse.json();
  createdPatientIds.push(patient.id);

  const clientName = `${clientNamePair.firstName} ${clientNamePair.lastName}`;
  return { client, patient, clientName };
}

test('appointment -> start visit -> visit workspace', async ({ page, request }) => {
  const { patient, clientName } = await createPatient(request, 'Appointment');
  const visitReason = `Appointment start ${RUN_ID}`;

  const appointmentResponse = await request.post(`${API_URL}/appointments`, {
    data: {
      patientId: patient.id,
      appointmentType: 'SickVisit',
      visitReason,
      startTime: '2027-06-01T10:30:00.000Z',
      expectedDurationMinutes: 30,
    },
  });
  expect(appointmentResponse.ok()).toBe(true);

  await page.goto(`/patients/${patient.id}`);
  await expect(page.getByRole('heading', { name: 'Current Visit' })).toBeVisible();
  await expect(page.getByLabel('Current Visit').getByText(visitReason)).toBeVisible();
  await page.getByRole('button', { name: 'Start Visit' }).click();

  await expect(page).toHaveURL(/\/visits\/[^/]+$/);
  await expect(page.getByText('Visit Workspace')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: patient.name })).toBeVisible();
  const contextSummary = page.getByRole('list', { name: 'Visit context summary' });
  await expect(contextSummary).toContainText(visitReason);
  await expect(contextSummary).toContainText(clientName);

  await page.getByText('Appointment & assignment details').click();
  await expect(page.getByText('Sick Visit')).toBeVisible();

  await page.getByRole('link', { name: new RegExp(`Back to ${patient.name}`) }).click();
  await expect(page.getByRole('heading', { name: 'Current Visit' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Resume Visit' })).toBeVisible();
  await expect(page.getByText('Active visit already started for this patient.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('link', { name: 'Resume Visit' })).toBeVisible();
});

test('patient workspace -> start walk-in visit -> visit workspace', async ({ page, request }) => {
  const { patient } = await createPatient(request, 'WalkIn');
  const visitReason = `Walk-in concern ${RUN_ID}`;

  await page.goto(`/patients/${patient.id}`);
  await expect(page.getByText('No appointment or active visit on deck')).toBeVisible();
  await page.getByLabel('Walk-in reason').fill(visitReason);
  await page.getByRole('button', { name: 'Create Walk-In Visit' }).click();

  await expect(page).toHaveURL(/\/visits\/[^/]+$/);
  await expect(page.getByText('Visit Workspace')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: patient.name })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Visit context summary' })).toContainText(visitReason);

  await page.getByText('Appointment & assignment details').click();
  await expect(page.getByText('Walk-in / no appointment')).toBeVisible();
});

test('active visit is shown instead of duplicate visit actions', async ({ page, request }) => {
  const { patient } = await createPatient(request, 'Duplicate');
  const visitReason = `Existing active visit ${RUN_ID}`;

  const visitResponse = await request.post(`${API_URL}/visits`, {
    data: { patientId: patient.id, reason: visitReason },
  });
  expect(visitResponse.ok()).toBe(true);
  const visit: { id: string } = await visitResponse.json();

  await page.goto(`/patients/${patient.id}`);
  await expect(page.getByText(visitReason)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Resume Visit' })).toHaveAttribute(
    'href',
    `/visits/${visit.id}`,
  );
  await expect(page.getByLabel('Walk-in reason')).toHaveCount(0);
});
