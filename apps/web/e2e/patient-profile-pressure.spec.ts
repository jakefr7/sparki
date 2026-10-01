import { expect, test, type APIRequestContext } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
async function fixture(request: APIRequestContext) {
  const clientResponse = await request.post(`${API_URL}/clients`, {
    data: { firstName: 'Casey', lastName: 'Pressure fixture', phone: '3125550148' },
  });
  expect(clientResponse.ok()).toBe(true);
  const client = (await clientResponse.json()) as { id: string };
  const response = await request.post(`${API_URL}/patients`, {
    data: {
      name: 'Pressure fixture',
      species: 'Dog',
      breed: 'Golden Retriever',
      clients: [{ clientId: client.id, isPrimary: true }],
    },
  });
  expect(response.ok()).toBe(true);
  return { patient: (await response.json()) as { id: string }, client };
}

test('editor traps focus, retains dismissed drafts, discards on Cancel and reports partial saves', async ({
  page,
  request,
}) => {
  const { patient, client } = await fixture(request);
  const addressResponse = await request.patch(`${API_URL}/clients/${client.id}`, {
    data: {
      addressLine1: '123 Test Lane',
      city: 'Chicago',
      state: 'IL',
      postalCode: '60601',
      country: 'US',
      formattedAddress: '123 Test Lane, Chicago, IL 60601',
      addressPlaceId: 'qa-place',
    },
  });
  expect(addressResponse.ok()).toBe(true);
  await page.goto(`/patients/${patient.id}`);
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Profile', exact: true });
  await expect(dialog.getByLabel('Patient name', { exact: true })).toBeFocused();
  await dialog.getByLabel('Patient name', { exact: true }).fill('Edited pressure fixture');
  await dialog.getByRole('button', { name: 'Save', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close edit form' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit Profile', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
  await expect(dialog.getByLabel('Patient name', { exact: true })).toHaveValue(
    'Edited pressure fixture',
  );
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
  await expect(dialog.getByLabel('Patient name', { exact: true })).toHaveValue('Pressure fixture');
  await dialog.getByLabel('Patient name', { exact: true }).fill('Edited pressure fixture');
  await dialog.getByLabel('First name', { exact: true }).fill('Taylor');
  await page.route(`**/api/clients/${client.id}`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Fixture unavailable' }),
    }),
  );
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Patient details saved, but owner details could not be saved',
  );
  await expect(dialog.getByLabel('First name', { exact: true })).toHaveValue('Taylor');
  await page.unroute(`**/api/clients/${client.id}`);
  const ownerSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/clients/${client.id}`) &&
      response.request().method() === 'PATCH',
  );
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await ownerSaved).ok()).toBe(true);
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Edited pressure fixture' }),
  ).toBeVisible();
  await expect(page.getByText('Owner: Taylor Pressure fixture', { exact: true })).toBeVisible();
  const savedClientResponse = await request.get(`${API_URL}/clients/${client.id}`);
  expect(savedClientResponse.ok()).toBe(true);
  expect(await savedClientResponse.json()).toMatchObject({
    formattedAddress: '123 Test Lane, Chicago, IL 60601',
    addressPlaceId: 'qa-place',
  });
});

test('alerts reject whitespace and header link opens the complete alert list', async ({
  page,
  request,
}) => {
  const { patient } = await fixture(request);
  await page.goto(`/patients/${patient.id}`);
  await page.getByRole('tab', { name: 'Alerts', exact: true }).click();
  await page.getByRole('button', { name: 'Add Alert', exact: true }).click();
  await page.getByLabel('Alert text', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'Add alert', exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText('Enter alert text.');
  await page.getByLabel('Alert text', { exact: true }).fill('QA caution note');
  const firstAlertSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/patients/${patient.id}/alerts`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Add alert', exact: true }).click();
  expect((await firstAlertSaved).ok()).toBe(true);
  await expect(page.getByRole('button', { name: 'Add Alert', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Alert', exact: true }).click();
  await page.getByLabel('Alert text', { exact: true }).fill('QA critical note');
  await page.getByLabel('Severity').selectOption('Critical');
  const secondAlertSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/patients/${patient.id}/alerts`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Add alert', exact: true }).click();
  expect((await secondAlertSaved).ok()).toBe(true);
  await expect(page.getByRole('button', { name: 'Add Alert', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByRole('link', { name: 'View all', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Alerts', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page
      .getByRole('region', { name: 'Care Alerts' })
      .getByText('QA critical note', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Care Alerts' }).getByText('QA caution note', { exact: true }),
  ).toBeVisible();
});

test('prescription load failure offers retry and does not claim an empty list', async ({
  page,
  request,
}) => {
  const { patient } = await fixture(request);
  await page.route(`**/api/patients/${patient.id}/prescriptions`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Could not load prescriptions.' }),
    }),
  );
  await page.goto(`/patients/${patient.id}`);
  await page.getByRole('tab', { name: 'Medications', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Prescriptions', exact: true });
  await expect(panel.getByRole('alert')).toHaveText('Could not load prescriptions.');
  await expect(panel.getByText('No prescriptions yet')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Prepare prescription' })).toHaveCount(0);
  await page.unroute(`**/api/patients/${patient.id}/prescriptions`);
  await panel.getByRole('button', { name: 'Try again' }).click();
  await expect(panel.getByText('No prescriptions yet')).toBeVisible();
  await panel.getByRole('button', { name: 'Prepare prescription' }).click();
  await expect(panel.getByLabel('Medication', { exact: true })).toBeFocused();
  await expect(
    panel.getByText('All fields are required except Hospital medication.'),
  ).toBeVisible();
});

test('populated history retains visit context, invoices recover from errors, photos reject invalid files', async ({
  page,
  request,
}) => {
  const { patient } = await fixture(request);
  const visitResponse = await request.post(`${API_URL}/visits`, {
    data: { patientId: patient.id, reason: 'QA ONLY — history fixture' },
  });
  expect(visitResponse.ok()).toBe(true);
  const visit = (await visitResponse.json()) as { id: string };
  await page.goto(`/patients/${patient.id}`);
  await expect(page.getByText('Active', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Medical History', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'QA ONLY — history fixture', exact: true }),
  ).toHaveAttribute('href', `/visits/${visit.id}`);
  await page.getByText('View documentation', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open full visit record →' })).toBeVisible();
  await page.screenshot({
    path: '/private/tmp/sparki-profile-populated-history.png',
    fullPage: true,
  });
  await page.route(`**/api/patients/${patient.id}/invoices`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Could not load invoice history.' }),
    }),
  );
  await page.getByRole('tab', { name: 'Invoices', exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText('Could not load invoice history.');
  await expect(page.getByText('No invoices yet')).toHaveCount(0);
  await page.unroute(`**/api/patients/${patient.id}/invoices`);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Current visit charges' })).toBeVisible();
  await page.route('**/api/inventory/items?*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{}',
    }),
  );
  await page.getByPlaceholder('Search hospital catalog').fill('QA catalog search');
  await expect(page.locator('p[role="alert"]')).toHaveText(
    'Could not search the hospital catalog. Try searching again.',
  );
  await expect(page.getByText('No billable catalog items found.')).toHaveCount(0);
  await page.unroute('**/api/inventory/items?*');
  await page.getByPlaceholder('Search hospital catalog').fill('');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page.getByRole('tab', { name: 'Invoices', exact: true }).evaluate((button) => {
        const list = button.parentElement!.getBoundingClientRect();
        const selected = button.getBoundingClientRect();
        return selected.left >= list.left - 1 && selected.right <= list.right + 1;
      }),
    )
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '/private/tmp/sparki-profile-populated-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Add patient photo', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'invalid.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Not an image'),
  });
  await expect(page.locator('p[role="alert"]')).toHaveText(
    'Choose a JPEG, PNG, WebP, or GIF image.',
  );
});
