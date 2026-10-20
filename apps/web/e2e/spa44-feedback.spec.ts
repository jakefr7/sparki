import { expect, test } from '@playwright/test';
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

test('SPA-44 veterinarian books through the real UI and manages the appointment', async ({ page, request }) => {
  const staff = await (await request.get(`${API_URL}/staff`)).json() as Array<{ id: string; role: string; canReceiveAppointments: boolean }>;
  const vet = staff.find(member => member.role === 'VETERINARIAN')!;
  const provider = staff.find(member => member.canReceiveAppointments)!;
  expect(vet).toBeTruthy();
  expect(provider).toBeTruthy();
  const typeResponse = await request.post(`${API_URL}/scheduler-config/appointment-types`, { data: {
    appointmentType: 'Recheck', name: 'SPA44 Veterinarian Booking', defaultDurationMinutes: 30,
    color: '#2563EB', isActive: true, sortOrder: 0, providerIds: [provider.id],
  } });
  expect(typeResponse.ok()).toBe(true);
  const type = await typeResponse.json();
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    const block = await request.post(`${API_URL}/scheduler-config/slot-templates`, { data: {
      dayOfWeek, startTime: '08:00', endTime: '18:00', label: 'SPA44 Booking QA', color: '#2563EB',
      staffId: provider.id, isActive: true, appointmentTypeIds: [type.id],
    } });
    expect(block.ok()).toBe(true);
  }
  const client = await (await request.post(`${API_URL}/clients`, { data: { firstName: 'SPA44', lastName: 'Veterinarian Booking' } })).json();
  const patientResponse = await request.post(`${API_URL}/patients`, { data: { name: 'SPA44 Vet Booking QA', species: 'Dog', clients: [{ clientId: client.id, isPrimary: true }] } });
  expect(patientResponse.ok()).toBe(true);
  const patient = await patientResponse.json();
  await page.context().addCookies([{ name: 'sparki_session', value: `dev:${vet.id}`, domain: '127.0.0.1', path: '/' }]);
  await page.goto(`/patients/${patient.id}`);
  await page.getByRole('button', { name: 'New Appointment', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Appointment', exact: true });
  await dialog.getByRole('combobox', { name: 'Appointment type', exact: true }).selectOption(type.id);
  await dialog.getByRole('button', { name: /, times available$/ }).first().click();
  await dialog.locator('.new-appointment-slot').first().click();
  await dialog.getByRole('textbox', { name: /^Visit Notes/ }).fill('Veterinarian booking permission QA');
  const booking = page.waitForResponse(response => response.url().endsWith('/api/appointments') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Schedule Appointment', exact: true }).click();
  const booked = await booking;
  expect(booked.status()).toBe(201);
  const appointment = await booked.json();
  expect(appointment.createdById).toBe(vet.id);
  const confirmed = await page.request.post(`${API_URL}/appointments/${appointment.id}/confirm`);
  expect(confirmed.status()).toBe(201);
  expect((await confirmed.json()).state).toBe('Confirmed');
  const confirmation = await page.request.patch(`${API_URL}/appointments/${appointment.id}/confirmation-status`, { data: { confirmationStatus: 'Confirmed' } });
  expect(confirmation.ok()).toBe(true);
  const from = new Date(appointment.scheduledAt);
  from.setUTCDate(from.getUTCDate() + 1);
  const until = new Date(from.getTime() + 3 * 86400000);
  const available = await page.request.get(`${API_URL}/appointments/availability/search`, { params: { appointmentTypeId: type.id, providerId: provider.id, startDate: from.toISOString(), endDate: until.toISOString() } });
  expect(available.ok()).toBe(true);
  const slot = (await available.json()).slots[0];
  expect(slot).toBeTruthy();
  const moved = await page.request.patch(`${API_URL}/appointments/${appointment.id}/move`, { data: { appointmentTypeId: type.id, assignedProviderId: provider.id, scheduleBlockId: slot.blockId, startTime: slot.start, expectedDurationMinutes: 30, reason: 'Vet rescheduling QA' } });
  expect(moved.ok()).toBe(true);
  expect(new Date((await moved.json()).scheduledAt).toISOString()).toBe(slot.start);
  const cancelled = await page.request.post(`${API_URL}/appointments/${appointment.id}/cancel`, { data: { reason: 'Vet cancellation QA' } });
  expect(cancelled.status()).toBe(201);
  expect((await cancelled.json()).state).toBe('Cancelled');
  const history = await (await page.request.get(`${API_URL}/appointments/${appointment.id}/history`)).json();
  expect(history.length).toBeGreaterThanOrEqual(4);
  expect(history.every((change: { actorId: string }) => change.actorId === vet.id)).toBe(true);
  const newPatientBooking = await page.request.post(`${API_URL}/appointments/new-patient`, { data: {
    client: { firstName: 'SPA44', lastName: 'New Patient Booking' },
    patient: { name: 'SPA44 New Vet Booking QA', species: 'Dog' },
    appointment: { appointmentType: 'Recheck', appointmentTypeId: type.id, visitReason: 'Vet new-patient booking QA', assignedProviderId: provider.id, scheduleBlockId: slot.blockId, startTime: slot.start, expectedDurationMinutes: 30 },
  } });
  expect(newPatientBooking.status()).toBe(201);
  expect(await newPatientBooking.json()).toMatchObject({ createdById: vet.id, patient: { name: 'SPA44 New Vet Booking QA' } });
  const config = await (await page.request.get(`${API_URL}/scheduler-config`)).json();
  expect(config.canManage).toBe(false);
  expect((await page.request.patch(`${API_URL}/scheduler-config/settings`, { data: { slotIntervalMinutes: 30 } })).status()).toBe(403);
});

test('SPA-44 selected address stays selected and failed details can be retried', async ({
  page,
}) => {
  await page.route('**/api/address/autocomplete?*', (route) =>
    route.fulfill({ json: [{ id: 'spa44-place', label: '123 Main Street, Chicago' }] }),
  );
  let failDetails: 'http' | 'empty' | false = 'http';
  await page.route('**/api/address/details?*', (route) =>
    route.fulfill(
      failDetails
        ? { status: failDetails === 'http' ? 503 : 200, json: null }
        : {
            json: {
              addressLine1: '123 Main Street',
              city: 'Chicago',
              state: 'IL',
              postalCode: '60601',
              country: 'US',
              formattedAddress: '123 Main Street, Chicago, IL 60601',
              placeId: 'spa44-place',
              latitude: 41.88,
              longitude: -87.63,
            },
          },
    ),
  );
  await page.goto('/patients');
  await page.getByRole('button', { name: 'New Patient', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Patient', exact: true });
  await dialog.getByRole('combobox', { name: 'Street address' }).fill('123 Main');
  await dialog.getByRole('option', { name: '123 Main Street, Chicago' }).click();
  await expect(
    dialog.getByText('Could not fill the address details. Try again or enter them manually.'),
  ).toBeVisible();
  // Wait longer than debounce to catch a search triggered by the selection itself.
  await page.waitForTimeout(650);
  await expect(dialog.locator('.address-autocomplete [role=option]')).toHaveCount(0);
  failDetails = 'empty';
  await dialog.getByRole('button', { name: 'Try address again' }).click();
  await expect(dialog.getByText('Could not fill the address details. Try again or enter them manually.')).toBeVisible();
  failDetails = false;
  await dialog.getByRole('button', { name: 'Try address again' }).click();
  await expect(dialog.getByLabel('City', { exact: true })).toHaveValue('Chicago');
  await expect(dialog.getByLabel('ZIP/postal code')).toHaveValue('60601');
  await page.waitForTimeout(650);
  await expect(dialog.locator('.address-autocomplete [role=option]')).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Street address' })).toHaveValue(
    '123 Main Street',
  );
  await dialog.getByRole('combobox', { name: 'Street address' }).fill('456 Other');
  await expect(dialog.locator('.address-autocomplete [role=option]')).toHaveCount(1);
});

test('SPA-44 veterinarian can create inventory with a familiar price format', async ({
  page,
  request,
}) => {
  const staff = (await (await request.get(`${API_URL}/staff`)).json()) as Array<{
    id: string;
    role: string;
  }>;
  const vet = staff.find((member) => member.role === 'VETERINARIAN')!;
  expect(vet).toBeTruthy();
  await page
    .context()
    .addCookies([
      { name: 'sparki_session', value: `dev:${vet.id}`, domain: '127.0.0.1', path: '/' },
    ]);
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Items', exact: true }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Item', exact: true });
  await dialog.getByLabel('Item name').fill('SPA44 Decimal QA');
  await dialog.getByLabel('Retail price', { exact: true }).fill('$1,23.45');
  await dialog.getByRole('button', { name: 'Create item', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Enter a retail price');
  await expect(dialog.getByLabel('Retail price', { exact: true })).toBeFocused();
  await dialog.getByLabel('Retail price', { exact: true }).fill('$.50');
  await dialog.getByRole('button', { name: 'Create item', exact: true }).click();
  await expect(dialog).toBeHidden();
  const items = (await (
    await request.get(`${API_URL}/inventory/items?search=SPA44%20Decimal%20QA`)
  ).json()) as Array<{ id: string; retailPrice: string }>;
  expect(items).toHaveLength(1);
  expect(Number(items[0]!.retailPrice)).toBe(0.5);
  await page.getByRole('row', { name: /SPA44 Decimal QA/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Item', exact: true });
  await editor.getByLabel('Retail price', { exact: true }).fill('$1,234.50');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor).toBeHidden();
  const saved = await (await request.get(`${API_URL}/inventory/items/${items[0]!.id}`)).json();
  expect(Number(saved.retailPrice)).toBe(1234.5);
});

test('SPA-44 hospital editor is anchored to its search and directory formats phone numbers', async ({
  page,
  request,
}) => {
  const client = await (
    await request.post(`${API_URL}/clients`, {
      data: { firstName: 'SPA44', lastName: 'Contacts', phone: '3125550123' },
    })
  ).json();
  const patientResponse = await request.post(`${API_URL}/patients`, {
    data: {
      name: 'SPA44 Contacts QA',
      species: 'Dog',
      clients: [{ clientId: client.id, isPrimary: true }],
    },
  });
  expect(patientResponse.ok()).toBe(true);
  const patient = await patientResponse.json();
  await page.goto('/patients');
  const card = page.locator('.patient-directory-card').filter({ hasText: 'SPA44 Contacts QA' });
  await expect(card).toContainText('(312) 555-0123');
  await page.goto(`/patients/${patient.id}`);
  const panel = page.getByRole('region', { name: 'Providers and records' });
  await panel.getByRole('button', { name: 'Edit providers' }).click();
  await panel.getByLabel('Referring vet', { exact: true }).fill('SPA44 Hospital');
  await panel.getByRole('button', { name: 'Add new hospital', exact: true }).click();
  const hospital = panel.getByRole('group', { name: 'New hospital', exact: true });
  await expect(hospital.getByLabel('Hospital name', { exact: true })).toBeFocused();
  const hospitalBox = await hospital.boundingBox();
  const additionalBox = await panel
    .getByLabel('Additional providers', { exact: true })
    .boundingBox();
  expect(hospitalBox!.y + hospitalBox!.height).toBeLessThan(additionalBox!.y);
  await expect(panel.getByRole('button', { name: 'Add new hospital', exact: true })).toHaveCount(0);
  await hospital.getByLabel('Veterinarian', { exact: true }).fill('Dr. SPA44');
  await hospital.getByRole('button', { name: 'Save hospital and select' }).click();
  await expect(hospital).toBeHidden();
  await panel.getByRole('button', { name: 'Save providers', exact: true }).click();
  await page.reload();
  await expect(panel.getByText('SPA44 Hospital · Dr. SPA44', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await panel.getByRole('button', { name: 'Edit providers' }).click();
  await expect(
    panel.getByRole('button', { name: 'Remove SPA44 Hospital · Dr. SPA44' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: '/private/tmp/sparki-spa44-providers-tablet.png', fullPage: true });
});

test('SPA-44 successful address selection does not reopen suggestions', async ({ page }) => {
  let searches = 0;
  await page.route('**/api/address/autocomplete?*', (route) => {
    searches += 1;
    return route.fulfill({ json: [{ id: 'spa44-place', label: '123 Main Street, Chicago' }] });
  });
  await page.route('**/api/address/details?*', (route) =>
    route.fulfill({
      json: {
        addressLine1: '123 Main Street',
        city: 'Chicago',
        state: 'IL',
        postalCode: '60601',
        country: 'US',
        formattedAddress: '123 Main Street, Chicago, IL 60601',
        placeId: 'spa44-place',
        latitude: 41.88,
        longitude: -87.63,
      },
    }),
  );
  await page.goto('/patients');
  await page.getByRole('button', { name: 'New Patient', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Patient', exact: true });
  await dialog.getByRole('combobox', { name: 'Street address' }).fill('123 Main');
  await dialog.locator('.address-autocomplete [role=option]').click();
  await expect(dialog.getByLabel('City', { exact: true })).toHaveValue('Chicago');
  await page.waitForTimeout(750);
  await expect(dialog.locator('.address-autocomplete [role=option]')).toHaveCount(0);
  expect(searches).toBe(1);
});

test('SPA-44 late address details never replace a manual edit', async ({ page }) => {
  await page.route('**/api/address/autocomplete?*', (route) =>
    route.fulfill({ json: [{ id: 'spa44-place', label: '123 Main Street, Chicago' }] }),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/address/details?*', async (route) => {
    await gate;
    await route
      .fulfill({
        json: {
          addressLine1: '123 Main Street',
          city: 'Chicago',
          state: 'IL',
          postalCode: '60601',
          country: 'US',
          placeId: 'spa44-place',
        },
      })
      .catch(() => {});
  });
  await page.goto('/patients');
  await page.getByRole('button', { name: 'New Patient', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Patient', exact: true });
  const street = dialog.getByRole('combobox', { name: 'Street address' });
  await street.fill('123 Main');
  await expect(dialog.getByRole('option', { name: '123 Main Street, Chicago' })).toBeVisible();
  await street.press('ArrowDown');
  const requested = page.waitForRequest('**/api/address/details?*');
  await street.press('Enter');
  await requested;
  await street.fill('456 Other Street');
  await dialog.getByLabel('City', { exact: true }).fill('Evanston');
  release();
  await page.waitForTimeout(700);
  await expect(street).toHaveValue('456 Other Street');
  await expect(dialog.getByLabel('City', { exact: true })).toHaveValue('Evanston');
});

test('SPA-44 medication doctor selection and refill review preserve saved history', async ({
  page,
  request,
}) => {
  const client = await (
    await request.post(`${API_URL}/clients`, {
      data: { firstName: 'SPA44', lastName: 'Medications' },
    })
  ).json();
  const patientResponse = await request.post(`${API_URL}/patients`, {
    data: {
      name: 'SPA44 Medication QA',
      species: 'Dog',
      clients: [{ clientId: client.id, isPrimary: true }],
    },
  });
  expect(patientResponse.ok()).toBe(true);
  const patient = await patientResponse.json();
  const catalog = await (await request.get(`${API_URL}/inventory/items?search=Gabapentin`)).json();
  expect(catalog.length).toBeGreaterThan(0);
  const medicationResponse = await request.post(`${API_URL}/patients/${patient.id}/medications`, {
    data: {
      catalogItemId: catalog[0].id,
      medicationName: catalog[0].name,
      dose: 'Existing test dose',
      prescribedBy: 'Historical Outside Vet',
      instructions: 'Existing test instructions',
    },
  });
  expect(medicationResponse.ok()).toBe(true);
  const medication = await medicationResponse.json();
  const staff = await (await request.get(`${API_URL}/staff?role=VETERINARIAN`)).json();
  expect(staff.length).toBeGreaterThan(0);
  await page.goto(`/patients/${patient.id}`);
  await page.getByRole('tab', { name: 'Medications', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Medications', exact: true });
  await panel.getByRole('button', { name: 'Refill', exact: true }).click();
  const review = panel.getByRole('region', { name: 'Review refill', exact: true });
  await expect(review).toContainText('Historical Outside Vet');
  await expect(review).toContainText('Stock dispensing and label printing are not available');
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  let saved = await (await request.get(`${API_URL}/patients/${patient.id}/workspace`)).json();
  expect(
    saved.sections.medications.items.find((item: { id: string }) => item.id === medication.id)
      .refillCount,
  ).toBe(0);
  await panel.getByRole('button', { name: 'Refill', exact: true }).click();
  await review.getByRole('button', { name: 'Edit medication' }).click();
  await expect(panel.getByLabel('Prescriber name', { exact: true })).toHaveValue(
    'Historical Outside Vet',
  );
  await expect(
    panel.getByLabel('Prescribed by', { exact: true }).locator(`option[value="${staff[0].id}"]`),
  ).toHaveCount(1);
  await panel.getByLabel('Prescribed by', { exact: true }).selectOption(staff[0].id);
  await panel.getByRole('textbox', { name: 'Instructions', exact: true }).fill('Reviewed test instructions');
  await panel.getByRole('button', { name: 'Save medication', exact: true }).click();
  await expect(review).toContainText(staff[0].displayName);
  await expect(review).toContainText('Reviewed test instructions');
  await review.getByRole('button', { name: 'Record refill', exact: true }).click();
  await expect(review).toBeHidden();
  await expect(panel.locator('.patient-medication-card')).toContainText('Last refill');
  saved = await (await request.get(`${API_URL}/patients/${patient.id}/workspace`)).json();
  expect(
    saved.sections.medications.items.find((item: { id: string }) => item.id === medication.id),
  ).toMatchObject({
    refillCount: 1,
    prescribedBy: staff[0].displayName,
    instructions: 'Reviewed test instructions',
  });
  await page.screenshot({ path: '/private/tmp/sparki-spa44-medication.png', fullPage: true });
});
