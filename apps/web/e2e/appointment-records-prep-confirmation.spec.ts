import { expect, test } from '@playwright/test';
import { fixtureId } from './support/fixture-id';
import { pickClientName, pickPatientName } from './support/fixture-names';
import { cleanupFixture } from './support/cleanup-fixture';
import { loginAs } from './support/login';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const RUN_ID = fixtureId();
const CLIENT_NAME_PAIR = pickClientName(`records-prep-confirmation-client-${RUN_ID}`);
const PATIENT_NAME = pickPatientName(`records-prep-confirmation-patient-${RUN_ID}`);

let patientId: string;
let clientId: string;
let appointmentId: string;
let visitId: string;

/** Fixed, known clinic-hours time today — same trick as
 *  new-patient-appointment.spec.ts, avoids the appointment landing outside
 *  whatever window the scheduler/Today happen to render at odd hours. */
function todayAt(hour: number, minute = 0): string {
  const now = new Date();
  now.setHours(hour, minute, 0, 0);
  return now.toISOString();
}

test.beforeAll(async ({ request }) => {
  const clientResponse = await request.post(`${API_URL}/clients`, {
    data: {
      firstName: CLIENT_NAME_PAIR.firstName,
      lastName: CLIENT_NAME_PAIR.lastName,
      phone: `555-6${RUN_ID.slice(-3)}`,
    },
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

  const appointmentResponse = await request.post(`${API_URL}/appointments`, {
    data: {
      patientId,
      appointmentType: 'WellnessPreventiveCare',
      visitReason: 'New patient visit — records prep fixture',
      startTime: todayAt(10),
      expectedDurationMinutes: 30,
      primaryCareVetName: 'Dr. Adams',
      previousClinicName: 'Maple Street Animal Hospital',
      previousRecordsSource: 'Will fax records',
      lastSeenAt: '2027-01-10T12:00:00.000Z',
    },
  });
  expect(appointmentResponse.ok()).toBe(true);
  const appointment: { id: string } = await appointmentResponse.json();
  appointmentId = appointment.id;

  const arriveResponse = await request.post(`${API_URL}/appointments/${appointmentId}/arrive`);
  expect(arriveResponse.ok()).toBe(true);

  const visitResponse = await request.post(`${API_URL}/visits`, { data: { appointmentId } });
  expect(visitResponse.ok()).toBe(true);
  const visit: { id: string } = await visitResponse.json();
  visitId = visit.id;
});

test.afterAll(async () => {
  await cleanupFixture({ patientIds: [patientId], clientIds: [clientId] });
});

test('scheduler appointment detail shows records-prep summary and honest confirmation status, and confirmation status can be updated', async ({
  page,
  request,
}) => {
  await loginAs(page, 'testrecept@gmail.com');
  await page.goto('/scheduler');

  // Disambiguate by owner last name too — the small fixture-name pool can
  // collide with an unrelated seeded patient of the same pet name.
  const appointmentCard = page
    .getByRole('button')
    .filter({ hasText: PATIENT_NAME })
    .filter({ hasText: CLIENT_NAME_PAIR.lastName });
  await expect(appointmentCard).toBeVisible();
  // The card is `draggable`, which makes Playwright's simulated mouse click
  // register as a drag gesture instead of firing onClick. Dispatching a
  // real "click" event bypasses that and reliably triggers the handler.
  await appointmentCard.dispatchEvent('click');

  const dialog = page.getByRole('dialog', { name: PATIENT_NAME });
  await expect(dialog).toBeVisible();

  // Records-request context from the New Patient booking is visible here.
  await expect(dialog.getByText('Primary care vet: Dr. Adams')).toBeVisible();
  await expect(dialog.getByText('Previous clinic: Maple Street Animal Hospital')).toBeVisible();
  await expect(dialog.getByText('Records source: Will fax records')).toBeVisible();

  // Confirmation status is shown honestly — never implying a message was sent.
  const confirmationSelect = dialog.getByLabel('Confirmation / reminder status');
  await expect(confirmationSelect).toHaveValue('NotSent');
  await expect(dialog.getByText(/no confirmation or reminder is sent automatically/i)).toBeVisible();

  const [confirmationResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/confirmation-status') && response.request().method() === 'PATCH',
    ),
    confirmationSelect.selectOption('SentManually'),
  ]);
  expect(confirmationResponse.ok()).toBe(true);
  await expect(confirmationSelect).toHaveValue('SentManually');

  const appointmentResponse = await request.get(`${API_URL}/appointments/${appointmentId}`);
  const updatedAppointment: { confirmationStatus: string } = await appointmentResponse.json();
  expect(updatedAppointment.confirmationStatus).toBe('SentManually');
});

test('tech/assistant can review records-prep context and update the checklist status from the visit workspace', async ({
  page,
  request,
}) => {
  await loginAs(page, 'testtech@gmail.com');
  await page.goto(`/visits/${visitId}`);

  const panel = page.locator('.records-prep-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Dr. Adams')).toBeVisible();
  await expect(panel.getByText('Maple Street Animal Hospital')).toBeVisible();
  await expect(panel.getByText('Will fax records')).toBeVisible();

  const statusSelect = panel.getByLabel('Records prep status');
  await expect(statusSelect).toHaveValue('NotStarted');

  await statusSelect.selectOption('Received');
  await expect(page.locator('.records-prep-panel').getByLabel('Records prep status')).toHaveValue(
    'Received',
  );

  await page.reload();
  await expect(page.locator('.records-prep-panel').getByLabel('Records prep status')).toHaveValue(
    'Received',
  );

  const appointmentResponse = await request.get(`${API_URL}/appointments/${appointmentId}`);
  const updatedAppointment: { recordsPrepStatus: string } = await appointmentResponse.json();
  expect(updatedAppointment.recordsPrepStatus).toBe('Received');
});
