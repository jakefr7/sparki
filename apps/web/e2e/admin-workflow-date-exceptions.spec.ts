import { expect, test } from '@playwright/test';

test('admin edits workflow appearance and creates/removes a dated provider closure', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: /Visit workflow Names/ }).click();
  await expect(page.getByRole('heading', { name: 'Visit workflow', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add status', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Check In', exact: true }).click();
  await expect(page.getByLabel('Status name', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Protected visit phase')).toHaveCount(0);
  await expect(page.getByText('Allowed transitions', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /Scheduling Appointment/ }).click();
  await page.getByRole('button', { name: 'Add date exception', exact: true }).click();
  await page.getByLabel('Date', { exact: true }).fill('2027-01-10');
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('dev-user');
  await page.getByLabel('All day', { exact: true }).uncheck();
  await page.getByLabel('Start time', { exact: true }).fill('09:00');
  await page.getByLabel('End time', { exact: true }).fill('12:00');
  await page.getByLabel('Reason', { exact: true }).fill('Browser test provider leave');
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/api/scheduler-config/date-exceptions') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save date exception', exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByText('2027-01-10 · 09:00–12:00', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/private/tmp/sparki-admin-date-exceptions.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({
    path: '/private/tmp/sparki-admin-date-exceptions-mobile.png',
    fullPage: true,
  });
  const removed = page.waitForResponse(
    (response) =>
      response.url().includes('/api/scheduler-config/date-exceptions/') &&
      response.request().method() === 'DELETE',
  );
  await page.getByRole('button', { name: 'Remove exception', exact: true }).click();
  expect((await removed).ok()).toBe(true);
  await expect(
    page.getByText('No date exceptions. Booking follows weekly availability.'),
  ).toBeVisible();
});

test('admin keeps edits across groups and recovers from failed settings writes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: /Visit workflow Names/ }).click();
  const edit = page.getByRole('button', { name: 'Edit Check In', exact: true });
  await expect(edit).toHaveText('Edit');
  await edit.click();
  await expect(page.getByLabel('Status name', { exact: true })).toBeFocused();
  await page.getByLabel('Status name', { exact: true }).fill('Reception arrival');
  await page.getByRole('button', { name: /Scheduling Appointment/ }).click();
  await page.getByRole('button', { name: /Visit workflow Names/ }).click();
  await expect(page.getByLabel('Status name', { exact: true })).toHaveValue('Reception arrival');
  await page.screenshot({
    path: '/private/tmp/sparki-admin-workflow-polished.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(edit).toBeFocused();

  await page.getByRole('button', { name: /Services & checkout Invoice/ }).click();
  await page.screenshot({ path: '/private/tmp/sparki-admin-billing-polished.png', fullPage: true });
  const checkout = page.getByRole('checkbox', {
    name: /Allow checkout with an outstanding balance/,
  });
  await expect(checkout).toBeEnabled();
  const original = await checkout.isChecked();
  await page.route('**/api/visit-policy', async (route) => {
    if (route.request().method() === 'PUT') await route.abort('failed');
    else await route.continue();
  });
  await checkout.click();
  await expect(
    page.getByRole('region', { name: 'Checkout preferences' }).getByRole('alert'),
  ).toContainText('unchanged');
  await expect(checkout).toBeChecked({ checked: original });
  await expect(checkout).toBeEnabled();
  await page.unroute('**/api/visit-policy');

  await page.getByRole('button', { name: /Clinical permissions Record/ }).click();
  await expect(page.getByRole('heading', { name: 'Backup medical-record signers' })).toBeVisible();
  await page.screenshot({
    path: '/private/tmp/sparki-admin-permissions-polished.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: /Scheduling Appointment/ }).click();
  await expect(page.getByText('Booking setup', { exact: true })).toBeVisible();
  await page.screenshot({
    path: '/private/tmp/sparki-admin-scheduling-polished.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator('.admin-settings')
        .evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: '/private/tmp/sparki-admin-mobile-polished.png', fullPage: true });
});

test('scheduling load failure provides retry instead of indefinite loading', async ({ page }) => {
  await page.route('**/api/scheduler-config', (route) => route.abort('failed'));
  await page.route('**/api/visit-policy', (route) => route.abort('failed'));
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  const scheduler = page.getByRole('region', { name: 'Scheduling', exact: true });
  await expect(scheduler.getByRole('alert')).toContainText('Could not load scheduling settings.');
  await expect(scheduler.getByText('Loading scheduling settings…')).toHaveCount(0);
  await page.unroute('**/api/scheduler-config');
  await scheduler.getByRole('button', { name: 'Try again' }).click();
  await expect(scheduler.getByText('Booking setup', { exact: true })).toBeVisible();
  await expect(scheduler.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: /Services & checkout Invoice/ }).click();
  const policy = page.getByRole('region', { name: 'Checkout preferences' });
  await expect(policy.getByRole('alert')).toBeVisible();
  await expect(policy.getByRole('checkbox')).toHaveCount(0);
  await page.unroute('**/api/visit-policy');
  await policy.getByRole('button', { name: 'Try again' }).click();
  await expect(policy.getByRole('checkbox')).toBeEnabled();
});
