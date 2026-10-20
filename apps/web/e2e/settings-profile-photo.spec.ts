import { expect, test } from '@playwright/test';

const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const file = { name: 'profile.gif', mimeType: 'image/gif', buffer: gif };

test('Settings profile photo recovers from failed uploads, displays immediately and survives reload', async ({ page }) => {
  let failure: 'non-json' | 'network' | false = 'non-json';
  let removeFailure = true;
  await page.route('**/api/auth/profile/avatar', async route => {
    if (route.request().method() === 'DELETE' && removeFailure) return route.fulfill({ status: 503, contentType: 'text/plain', body: 'Temporarily unavailable' });
    if (route.request().method() === 'POST') {
      if (failure === 'non-json') return route.fulfill({ status: 503, contentType: 'text/plain', body: 'Temporarily unavailable' });
      if (failure === 'network') return route.abort('failed');
    }
    await route.continue();
  });
  await page.goto('/settings');
  const name = page.getByLabel('Display name', { exact: true });
  await expect(name).not.toHaveValue('');
  const originalName = await name.inputValue();
  await name.fill('Unsaved photo test draft');
  await page.getByLabel('Phone', { exact: true }).fill('3125550123');
  await page.getByRole('button', { name: 'Add profile image', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Profile image options' });
  const input = page.locator('.profile-settings input[type=file]');
  await input.setInputFiles(file);
  await expect(page.getByText('Could not upload this image. Please try again.', { exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Upload image', exact: true })).toBeEnabled();
  failure = 'network';
  const failedRequest = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/auth/profile/avatar'));
  await input.setInputFiles(file);
  await failedRequest;
  await expect(page.getByText('Could not upload this image. Please try again.', { exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Upload image', exact: true })).toBeEnabled();
  failure = false;
  await input.setInputFiles(file);
  await expect(page.getByText('Profile photo updated.', { exact: true })).toBeVisible();
  await expect(menu).toBeHidden();
  await expect(name).toHaveValue('Unsaved photo test draft');
  await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('3125550123');
  const preview = page.getByRole('img', { name: 'Profile preview', exact: true });
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect.poll(() => page.locator('.dashboard-header__avatar').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  const url = await preview.getAttribute('src');
  expect(url).toMatch(/^\/api\/auth\/profile\/avatar\//);
  const content = await page.request.get(url!);
  expect(content.status()).toBe(200);
  expect(content.headers()['content-type']).toContain('image/gif');
  expect(await content.body()).toEqual(gif);
  await page.reload();
  await expect(name).toHaveValue(originalName);
  await expect(preview).toHaveAttribute('src', url!);
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: 'Change profile image', exact: true }).click();
  await menu.getByRole('button', { name: 'Remove image', exact: true }).click();
  await expect(page.getByText('Could not remove this image. Please try again.', { exact: true })).toBeVisible();
  await expect(preview).toHaveAttribute('src', url!);
  await expect(menu.getByRole('button', { name: 'Remove image', exact: true })).toBeEnabled();
  removeFailure = false;
  await menu.getByRole('button', { name: 'Remove image', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByText('Profile photo removed.', { exact: true })).toBeVisible();
  expect((await page.request.get(url!)).status()).toBe(404);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add profile image', exact: true })).toBeVisible();
});
