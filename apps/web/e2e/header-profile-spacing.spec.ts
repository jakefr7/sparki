import { expect, test } from '@playwright/test';

test('short display names keep the header compact and preserve identity initials', async ({ page, context }, testInfo) => {
  await context.addCookies([{ name: 'sparki_session', value: 'header-ui-fixture', domain: '127.0.0.1', path: '/' }]);
  let profile = { id: 'header-user', firstName: 'Jacob', lastName: 'Franco', displayName: 'Jacob Franco', email: 'header@example.test', phone: null, avatarUrl: null, statusEmoji: null, statusText: null, role: 'VETERINARIAN' };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/profile') {
      if (route.request().method() === 'PATCH') profile = { ...profile, ...route.request().postDataJSON() };
      return route.fulfill({ json: profile });
    }
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: profile.id, name: profile.displayName, email: profile.email, role: profile.role, permissions: [] } } });
    if (path === '/api/clinic/billing') return route.fulfill({ json: { isRestricted: false, subscriptionStatus: 'ACTIVE' } });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/settings');
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Jacob Franco');
  await page.getByLabel('Display name', { exact: true }).fill('jay');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const user = page.locator('.dashboard-header__user');
  await expect(user.locator('strong')).toHaveText('jay');
  await expect(user.locator('.dashboard-header__avatar-frame')).toHaveText('JF');
  await expect(user.locator('img')).toHaveCount(0);
  const sizes = await user.evaluate((element) => {
    const avatar = element.querySelector('.dashboard-header__avatar-frame')!.getBoundingClientRect();
    const copy = element.querySelector('.dashboard-header__user-copy')!.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { left: avatar.left - box.left, padding: parseFloat(style.paddingLeft), gap: copy.left - avatar.right, centerOffset: Math.abs(avatar.top + avatar.height / 2 - copy.top - copy.height / 2), width: avatar.width };
  });
  expect(sizes.left).toBeCloseTo(sizes.padding, 0);
  expect(sizes.gap).toBe(9);
  expect(sizes.centerOffset).toBeLessThanOrEqual(1);
  expect(sizes.width).toBe(34);
  await page.screenshot({ path: testInfo.outputPath('header-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(user.locator('strong')).toHaveText('jay');
  await expect(user.locator('.dashboard-header__avatar-frame')).toHaveText('JF');
  await page.screenshot({ path: testInfo.outputPath('header-tablet.png'), fullPage: true });
});
