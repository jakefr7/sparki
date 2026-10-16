import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const pad = (value: number) => String(value).padStart(2, '0');

// Same calendar arithmetic as estimateDateOfBirth, in the browser's time zone.
function ageAgo(years: number, months = 0): string {
  const today = new Date();
  const index = today.getFullYear() * 12 + today.getMonth() - (years * 12 + months);
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  const day = Math.min(today.getDate(), new Date(year, month + 1, 0).getDate());
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// SPA-40 (Anna): an estimated age saves a real, adjustable date that stays
// marked as estimated. Booking responses are controlled here.
test('New Appointment saves an age as an estimated date of birth', async ({ page }) => {
  const provider = { id: 'dob-vet', displayName: 'DOB Vet', role: 'VETERINARIAN', isActive: true };
  await page.route('**/api/staff?canReceiveAppointments=true', (route) => route.fulfill({ json: [provider] }));
  await page.route('**/api/scheduler-config', (route) => route.fulfill({ json: {
    settings: { slotIntervalMinutes: 30 }, canManage: true, slotTemplates: [],
    appointmentTypes: [{ id: 'dob-type', appointmentType: 'SickVisit', name: 'Consult', defaultDurationMinutes: 30, color: '#14b8a6', isActive: true, sortOrder: 0, providers: [provider], isBookable: true }],
  } }));
  await page.route('**/api/appointments/availability?*', async (route) => {
    const from = new Date(new URL(route.request().url()).searchParams.get('startDate')!);
    from.setHours(10, 0, 0, 0);
    if (from < new Date()) from.setDate(from.getDate() + 1);
    await route.fulfill({ json: { durationMinutes: 30, slotIntervalMinutes: 30, slots: [{ start: from.toISOString(), end: new Date(from.getTime() + 1800000).toISOString(), providerId: provider.id, room: null, blockId: 'dob-block', recommended: true }] } });
  });
  await page.route('**/api/clients/search?*', (route) => route.fulfill({ json: [] }));
  const submissions: Array<{ patient: Record<string, unknown> }> = [];
  await page.route('**/api/appointments/new-patient', async (route) => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ status: 500, json: {} });
  });

  await page.goto('/scheduler');
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: /New appointment at/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New Appointment' });
  await dialog.getByRole('button', { name: 'New Patient', exact: true }).click();
  await expect(dialog.getByLabel('Age estimate')).toHaveCount(0);
  await dialog.getByLabel('First name', { exact: true }).fill('Test');
  await dialog.getByLabel('Last name', { exact: true }).fill('Owner');
  await dialog.getByLabel('Patient name', { exact: true }).fill('Juniper');

  const age = dialog.getByRole('group', { name: 'Age' });
  await age.getByText('Estimated age', { exact: true }).click();
  await age.getByLabel('Years').fill('1.5');
  await expect(age.getByLabel('Years')).toHaveValue('1.5');
  await expect(age.getByLabel('Estimated date of birth')).toHaveValue(ageAgo(1, 6));
  await age.getByLabel('Years').fill('5');
  await expect(age.getByLabel('Estimated date of birth')).toHaveValue(ageAgo(5));
  await age.getByLabel('Months').fill('6');
  await expect(age.getByLabel('Estimated date of birth')).toHaveValue(ageAgo(5, 6));
  await expect(age.getByText(/saved as an estimated date of birth/)).toBeVisible();

  // Switching to a known DOB never carries the estimate across.
  await age.getByText('Known DOB', { exact: true }).click();
  await expect(age.getByLabel('Date of birth', { exact: true })).toHaveValue('');
  await age.getByText('Estimated age', { exact: true }).click();
  await age.getByLabel('Years').fill('5');
  // A hand-adjusted estimated date stays estimated.
  await age.getByLabel('Estimated date of birth').fill('2021-01-15');

  await dialog.getByRole('combobox', { name: 'Appointment type', exact: true }).selectOption('dob-type');
  await dialog.getByRole('button', { name: 'Next Available', exact: true }).click();
  await dialog.locator('.new-appointment-slot').first().click();
  await dialog.getByRole('textbox', { name: /^Visit Notes/ }).fill('Annual exam');
  await dialog.getByRole('button', { name: 'Schedule Appointment', exact: true }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]!.patient).toMatchObject({ dateOfBirth: '2021-01-15', dateOfBirthEstimated: true });
  expect(submissions[0]!.patient).not.toHaveProperty('estimatedAge');
});

test('prescriptions ask for a date of birth before authorizing', async ({ page, request }) => {
  const clientResponse = await request.post(`${API_URL}/clients`, {
    data: { firstName: 'Dana', lastName: 'DOB fixture', phone: '3125550177' },
  });
  expect(clientResponse.ok()).toBe(true);
  const client = (await clientResponse.json()) as { id: string };
  const patientResponse = await request.post(`${API_URL}/patients`, {
    data: { name: 'DOB fixture', species: 'Dog', clients: [{ clientId: client.id, isPrimary: true }] },
  });
  expect(patientResponse.ok()).toBe(true);
  const patient = (await patientResponse.json()) as { id: string };
  const draftResponse = await request.post(`${API_URL}/patients/${patient.id}/prescriptions`, {
    data: { medicationName: 'Sample medication', strength: '10 mg', directions: 'QA only fixture directions.', quantity: '10', quantityUnit: 'tablets', allowedRefills: 0, expiresAt: '2030-01-01T00:00:00Z' },
  });
  expect(draftResponse.ok()).toBe(true);

  await page.goto(`/patients/${patient.id}`);
  await page.getByRole('tab', { name: 'Medications', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Prescriptions', exact: true });
  const authorize = panel.getByRole('button', { name: 'Authorize prescription' });
  await expect(panel.getByText('Date of birth needed.')).toBeVisible();
  await expect(authorize).toBeDisabled();

  const form = panel.getByRole('form', { name: 'Patient date of birth' });
  await form.getByRole('button', { name: 'Save date of birth' }).click();
  await expect(form.getByText('Enter a date of birth or an estimated age.')).toBeVisible();
  await form.getByLabel('Years').fill('3');
  await expect(form.getByLabel('Estimated date of birth')).toHaveValue(ageAgo(3));
  await form.getByRole('button', { name: 'Save date of birth' }).click();
  await expect(panel.getByText('Date of birth needed.')).toHaveCount(0);
  await expect(page.getByText(/About 3 years old · Estimated DOB/)).toBeVisible();

  await authorize.click();
  const download = panel.getByRole('link', { name: 'Download prescription PDF' });
  await expect(download).toBeVisible();
  const pdf = await request.get(`${API_URL}${(await download.getAttribute('href'))!.replace(/^\/api/, '')}`);
  expect(pdf.status()).toBe(200);
});
