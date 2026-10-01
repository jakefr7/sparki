import { expect, test } from '@playwright/test';

test('admin edits workflow appearance and creates/removes a dated provider closure', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visit workflow', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add status', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Check In', exact: true }).click();
  await expect(page.getByLabel('Status name', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Protected visit phase')).toHaveCount(0);
  await expect(page.getByText('Allowed transitions', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
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
