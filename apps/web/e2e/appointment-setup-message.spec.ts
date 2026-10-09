import { expect, test } from '@playwright/test';

for (const admin of [true, false]) {
  test(`empty appointment setup gives ${admin ? 'an Admin shortcut' : 'an owner-help message'}`, async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: {
      id: 'setup-user', name: 'Setup User', email: 'setup@example.test',
      role: admin ? 'OWNER' : 'RECEPTIONIST', permissions: admin ? ['MANAGE_ADMIN_SETTINGS'] : [],
    } } }));
    await page.route('**/api/scheduler-config', (route) => route.fulfill({ json: {
      settings: { slotIntervalMinutes: 30 }, appointmentTypes: [], slotTemplates: [], canManage: admin,
    } }));
    await page.goto('/scheduler');
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    await page.getByRole('button', { name: /New appointment at/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Let’s set up appointment types' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Your clinic needs an active appointment type before you can book an appointment.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Schedule Appointment' })).toHaveCount(0);
    if (admin) {
      await page.screenshot({ path: '/tmp/sparki-appointment-setup-popup.png' });
      await dialog.getByRole('link', { name: 'Open Admin settings' }).click();
      await expect(page).toHaveURL(/\/settings\?tab=admin$/);
      await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('button', { name: /Scheduling Appointment types/ })).toHaveAttribute('aria-current', 'page');
    } else {
      await expect(dialog.getByText('Ask your clinic owner or someone with Admin settings access to finish this setup.')).toBeVisible();
      await expect(dialog.getByRole('link', { name: 'Open Admin settings' })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toBeHidden();
    }
  });
}

test('a setup request failure retains the retry action instead of claiming types are missing', async ({ page }) => {
  await page.route('**/api/scheduler-config', (route) => route.fulfill({ status: 500, json: {} }));
  await page.goto('/scheduler');
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: /New appointment at/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Let’s set up appointment types' })).toHaveCount(0);
  const dialog = page.getByRole('dialog', { name: 'New Appointment' });
  await expect(dialog.getByText('Could not load booking setup.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await page.route('**/api/scheduler-config', (route) => route.fulfill({ json: { settings: { slotIntervalMinutes: 30 }, appointmentTypes: [], slotTemplates: [], canManage: true } }));
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Let’s set up appointment types' })).toBeVisible();
});
