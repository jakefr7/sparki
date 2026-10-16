import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

test('weekly blocks save selected weekdays, preserve edited hours, and keep the background still', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/settings?tab=admin');
  await page.getByRole('button', { name: 'Add schedule block', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add schedule block', exact: true });
  await dialog.getByLabel('Label', { exact: true }).fill('SPA42 consult');
  await dialog.getByRole('button', { name: 'Weekdays', exact: true }).click();
  await dialog.getByLabel('Start time', { exact: true }).fill('05:10');
  await dialog.getByLabel('End time', { exact: true }).fill('06:40');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(20, 400);
  await page.mouse.wheel(0, 900);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
  await expect(
    dialog.getByRole('button', { name: 'Save schedule block', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: '/tmp/spa42-weekday-dialog-desktop.png' });
  await dialog.getByRole('button', { name: 'Save schedule block', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.locator('.schedule-block-row').filter({ hasText: 'SPA42 consult' }),
  ).toHaveCount(5);
  await page.reload();
  const row = page.locator('.schedule-block-row').filter({ hasText: 'SPA42 consult' }).first();
  await expect(row).toContainText('5:10 AM');
  await row.getByRole('button', { name: 'Edit SPA42 consult', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit schedule block', exact: true });
  await editor.getByLabel('Start time', { exact: true }).fill('20:10');
  await editor.getByLabel('End time', { exact: true }).fill('22:35');
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(
    editor.getByRole('button', { name: 'Save schedule block', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: '/tmp/spa42-block-dialog-tablet.png' });
  await editor.getByRole('button', { name: 'Save schedule block', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await expect(
    page.locator('.schedule-block-row').filter({ hasText: 'SPA42 consult' }).first(),
  ).toContainText('8:10 PM–10:35 PM');
});

test('date closures support separate dates and weekends within a bounded range', async ({
  page,
}) => {
  await page.goto('/settings?tab=admin');
  await page.getByRole('button', { name: 'Add date exception', exact: true }).click();
  const form = page.locator('.date-exceptions-editor');
  await form.getByLabel('Date', { exact: true }).fill('2027-04-05');
  await form.getByRole('button', { name: 'Add another date', exact: true }).click();
  await form.getByLabel('Date', { exact: true }).fill('2027-04-12');
  await form.getByLabel('Reason', { exact: true }).fill('SPA42 selected dates');
  await form.getByRole('button', { name: 'Save date exception', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(
    page.locator('.date-exceptions-list article').filter({ hasText: 'SPA42 selected dates' }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Add date exception', exact: true }).click();
  await form.getByRole('combobox', { name: 'Dates to close', exact: true }).selectOption('repeat');
  await form.getByLabel('Start date', { exact: true }).fill('2027-05-01');
  await form.getByLabel('End date', { exact: true }).fill('2027-05-16');
  await form.getByRole('button', { name: 'Weekends', exact: true }).click();
  await form.getByLabel('Reason', { exact: true }).fill('SPA42 weekends');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: '/tmp/spa42-closures-tablet.png', fullPage: true });
  await form.getByRole('button', { name: 'Save date exception', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(
    page.locator('.date-exceptions-list article').filter({ hasText: 'SPA42 weekends' }),
  ).toHaveCount(6);
  await page.reload();
  await expect(
    page.locator('.date-exceptions-list article').filter({ hasText: 'SPA42 weekends' }),
  ).toHaveCount(6);
});

test('calendar expands for early and late hours and gives patient, time and visit reason separate lines', async ({
  page,
}) => {
  const start = new Date();
  start.setHours(5, 15, 0, 0);
  const appointment = {
    id: 'spa42-early',
    type: 'Recheck',
    appointmentType: 'Recheck',
    appointmentTypeSettingId: null,
    reason: 'Eye pressure recheck',
    state: 'Scheduled',
    scheduledAt: start.toISOString(),
    expectedDurationMinutes: 15,
    patient: {
      id: 'spa42-patient',
      name: 'Ruger',
      species: 'Dog',
      breed: 'Hound',
      sex: 'Neutered Male',
      dateOfBirth: null,
    },
    client: null,
    provider: null,
    careTeam: [],
    room: null,
    schedulerSlotTemplateId: null,
    schedulingIssue: null,
  };
  await page.route('**/api/appointments/schedule?**', (route) =>
    route.fulfill({ json: [appointment] }),
  );
  await page.route('**/api/scheduler-config', (route) =>
    route.fulfill({
      json: {
        settings: { slotIntervalMinutes: 30 },
        appointmentTypes: [],
        canManage: true,
        slotTemplates: [
          {
            id: 'late',
            dayOfWeek: start.getDay(),
            startTime: '20:10',
            endTime: '22:35',
            label: 'Late consult',
            color: '#1FA9A0',
            staffId: null,
            room: null,
            isActive: true,
            appointmentTypeIds: [],
          },
        ],
      },
    }),
  );
  await page.goto('/scheduler');
  const card = page.locator('.scheduler-appointment-card').filter({ hasText: 'Ruger' });
  await expect(card).toBeVisible();
  await expect(card.locator('strong')).toHaveText('Ruger');
  await expect(card.locator('.scheduler-appointment-card__reason')).toHaveText(
    'Eye pressure recheck',
  );
  await expect(card.locator('.scheduler-appointment-card__meta--primary')).toContainText('5:15');
  await expect(page.locator('.scheduler-time-column__hour').first()).toHaveText('5:00 AM');
  await expect(page.locator('.scheduler-time-column__hour').last()).toHaveText('10:00 PM');
  await page.screenshot({ path: '/tmp/spa42-calendar-desktop.png' });
  await page.setViewportSize({ width: 1024, height: 768 });
  await card.scrollIntoViewIfNeeded();
  for (const selector of [
    'strong',
    '.scheduler-appointment-card__meta--primary',
    '.scheduler-appointment-card__reason',
  ]) {
    expect(
      await card.locator(selector).evaluate((element) => {
        const parent = element.parentElement!.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        return rect.top >= parent.top && rect.bottom <= parent.bottom;
      }),
    ).toBe(true);
  }
  expect(
    await card.locator('strong').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  expect(
    await card
      .locator('.scheduler-appointment-card__meta--primary')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: '/tmp/spa42-calendar-tablet.png' });
});

test('inventory required fields are explicit, dropdowns are flat, and save errors retain entries', async ({
  page,
}) => {
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Items', exact: true }).click();
  await page.getByRole('button', { name: /Add Item/i, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Item', exact: true });
  await expect(dialog.getByText('Fields marked * are required.', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Item name', exact: true })).toHaveAttribute(
    'required',
    '',
  );
  expect(
    await dialog
      .getByRole('combobox', { name: 'Type', exact: true })
      .evaluate((element) => getComputedStyle(element).appearance),
  ).toBe('none');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
  await dialog.getByRole('textbox', { name: 'Item name', exact: true }).fill('SPA42 inventory');
  await page.route('**/api/inventory/items', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({
        status: 400,
        json: { message: { fieldErrors: { name: ['Choose another item name'] }, formErrors: [] } },
      });
    else await route.continue();
  });
  await dialog.getByRole('button', { name: 'Create item', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Choose another item name');
  await expect(dialog.getByRole('textbox', { name: 'Item name', exact: true })).toHaveValue(
    'SPA42 inventory',
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  await dialog.getByRole('textbox', { name: 'Item name', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/spa42-inventory-tablet.png' });
  await page.unroute('**/api/inventory/items');
  await dialog.getByRole('button', { name: 'Create item', exact: true }).click();
  await expect(dialog).toBeHidden();
});

test('patient profile separates age from DOB with existing muted detail labels', async ({
  page,
  request,
}) => {
  const client = await request.post(`${API_URL}/clients`, {
    data: { firstName: 'SPA42', lastName: 'Profile' },
  });
  expect(client.ok()).toBe(true);
  const patient = await request.post(`${API_URL}/patients`, {
    data: {
      name: 'SPA42 age',
      species: 'Dog',
      color: 'Golden',
      dateOfBirth: '2016-10-27',
      dateOfBirthEstimated: true,
      clients: [{ clientId: (await client.json()).id, isPrimary: true }],
    },
  });
  expect(patient.ok()).toBe(true);
  await page.goto(`/patients/${(await patient.json()).id}`);
  const details = page.locator('.patient-profile-hero__details');
  await expect(
    details.locator('div').filter({ has: page.locator('dt', { hasText: /^Age$/ }) }),
  ).toContainText('About');
  await expect(
    details.locator('div').filter({ has: page.locator('dt', { hasText: /^Estimated DOB$/ }) }),
  ).toContainText('October 27, 2016');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: '/tmp/spa42-profile-tablet.png' });
});

test('45-minute grid stays aligned when expanded hours leave a partial final slot', async ({
  page,
}) => {
  await page.route('**/api/appointments/schedule?**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/scheduler-config', (route) =>
    route.fulfill({
      json: {
        settings: { slotIntervalMinutes: 45 },
        appointmentTypes: [],
        canManage: true,
        slotTemplates: [
          {
            id: 'early',
            dayOfWeek: new Date().getDay(),
            startTime: '06:10',
            endTime: '08:20',
            label: 'Early consult',
            color: '#1FA9A0',
            staffId: null,
            room: null,
            isActive: true,
            appointmentTypeIds: [],
          },
        ],
      },
    }),
  );
  await page.goto('/scheduler');
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  const slots = page.locator('.scheduler-day-column__slots');
  await expect(slots.locator('button')).toHaveCount(18);
  await expect(slots.locator('button').first()).toHaveAccessibleName('New appointment at 6:00 AM');
  await expect(slots.locator('button').last()).toHaveAccessibleName('New appointment at 6:45 PM');
  const sizes = await slots.evaluate((element) => ({
    total: element.getBoundingClientRect().height,
    first: element.firstElementChild!.getBoundingClientRect().height,
    last: element.lastElementChild!.getBoundingClientRect().height,
  }));
  expect(sizes.first / sizes.total).toBeCloseTo(45 / 780, 3);
  expect(sizes.last / sizes.total).toBeCloseTo(15 / 780, 3);
});
