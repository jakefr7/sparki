import { expect, test } from '@playwright/test';

// UI contract checks; address/provider/booking responses are controlled here.
// The isolated runner still starts the real authenticated app and database.
test('Anna booking feedback: phone, address metadata, required notes and retry draft', async ({ page }) => {
  const provider = { id: 'feedback-vet', displayName: 'Feedback Vet', role: 'VETERINARIAN', isActive: true };
  await page.route('**/api/staff?canReceiveAppointments=true', (route) => route.fulfill({ json: [provider] }));
  await page.route('**/api/scheduler-config', (route) => route.fulfill({ json: {
    settings: { slotIntervalMinutes: 30 }, canManage: true, slotTemplates: [],
    appointmentTypes: [{ id: 'feedback-type', appointmentType: 'SickVisit', name: 'Consult', defaultDurationMinutes: 30, color: '#14b8a6', isActive: true, sortOrder: 0, providers: [provider], isBookable: true }],
  } }));
  await page.route('**/api/appointments/availability?*', async (route) => {
    const from = new Date(new URL(route.request().url()).searchParams.get('startDate')!);
    from.setHours(10, 0, 0, 0);
    if (from < new Date()) from.setDate(from.getDate() + 1);
    await route.fulfill({ json: { durationMinutes: 30, slotIntervalMinutes: 30, slots: [{ start: from.toISOString(), end: new Date(from.getTime() + 1800000).toISOString(), providerId: provider.id, room: null, blockId: 'feedback-block', recommended: true }] } });
  });
  await page.route('**/api/clients/search?*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/address/autocomplete?*', (route) => route.fulfill({ json: [{ id: 'feedback-place', label: '123 Main Street, Chicago' }] }));
  await page.route('**/api/address/details?*', (route) => route.fulfill({ json: { addressLine1: '123 Main Street', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US', formattedAddress: '123 Main Street, Chicago, IL 60601', placeId: 'feedback-place', latitude: 41.88, longitude: -87.63 } }));
  const submissions: Array<{ client: Record<string, unknown>; appointment: Record<string, unknown> }> = [];
  await page.route('**/api/appointments/new-patient', async (route) => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill(submissions.length === 1
      ? { status: 400, json: { message: { fieldErrors: { visitReason: ['Booking validation example'] }, formErrors: [] } } }
      : { status: 403, json: { message: 'This action requires one of the following roles: OWNER, PRACTICE_MANAGER, RECEPTIONIST' } });
  });
  await page.goto('/scheduler');
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: /New appointment at/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New Appointment' });
  await dialog.getByRole('button', { name: 'New Patient', exact: true }).click();
  await expect(dialog.getByLabel('Booking source')).toHaveCount(0);
  await expect(dialog.getByLabel('Records source')).toHaveCount(0);
  await expect(dialog.getByLabel('Date/time last seen')).toHaveCount(0);
  await dialog.getByLabel('First name', { exact: true }).fill('Test');
  await dialog.getByLabel('Last name', { exact: true }).fill('Owner');
  await dialog.getByLabel('Patient name', { exact: true }).fill('Rocco');
  await dialog.getByLabel('Phone number').fill('312555012345678');
  await expect(dialog.getByLabel('Phone number')).toHaveValue('(312) 555-0123');
  await dialog.getByLabel('Address line 1', { exact: true }).fill('123 Main');
  await dialog.getByRole('option', { name: '123 Main Street, Chicago', exact: true }).click();
  await expect(dialog.getByLabel('City', { exact: true })).toHaveValue('Chicago');
  await expect(dialog.getByLabel('ZIP/postal code')).toHaveValue('60601');
  await dialog.getByRole('combobox', { name: 'Appointment type', exact: true }).selectOption('feedback-type');
  await expect(dialog.getByRole('button', { name: /, times available$/ }).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Next Available', exact: true }).click();
  await dialog.locator('.new-appointment-slot').first().click();
  await dialog.getByRole('button', { name: 'Schedule Appointment', exact: true }).click();
  expect(submissions).toHaveLength(0);
  await expect(dialog.getByRole('textbox', { name: /^Visit Notes/ })).toHaveAttribute('required', '');
  await dialog.getByRole('textbox', { name: /^Visit Notes/ }).fill('   ');
  await dialog.getByRole('button', { name: 'Schedule Appointment', exact: true }).click();
  await expect(dialog.getByText('Visit Notes are required.', { exact: true })).toBeVisible();
  expect(submissions).toHaveLength(0);
  await dialog.getByRole('textbox', { name: /^Visit Notes/ }).fill('Eye irritation');
  await dialog.getByRole('button', { name: 'Schedule Appointment', exact: true }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]!.appointment).toMatchObject({ visitReason: 'Eye irritation' });
  expect(submissions[0]!.appointment).not.toHaveProperty('source');
  expect(submissions[0]!.client).toMatchObject({ phone: '3125550123', city: 'Chicago', addressPlaceId: 'feedback-place', addressLatitude: 41.88 });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Booking validation example');
  await expect(dialog.getByRole('textbox', { name: /^Visit Notes/ })).toHaveValue('Eye irritation');
  await dialog.getByLabel('City', { exact: true }).fill('Evanston');
  await dialog.getByRole('button', { name: 'Schedule Appointment', exact: true }).click();
  await expect.poll(() => submissions.length).toBe(2);
  expect(submissions[1]!.client).toMatchObject({ city: 'Evanston' });
  expect(submissions[1]!.client).not.toHaveProperty('addressPlaceId');
  await expect(dialog.getByRole('alert')).toContainText('Your account does not have permission to manage appointments');
  await expect(dialog.getByRole('textbox', { name: /^Visit Notes/ })).toHaveValue('Eye irritation');
});
