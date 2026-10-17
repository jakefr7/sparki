import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('public sign-in header and six-digit code entry', async ({ page }) => {
  await page.route('**/api/auth/email-code/request', (route) => route.fulfill({ json: { success: true } }));
  await page.route('**/api/auth/email-code/verify', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ email: 'test@example.test', code: '654321' });
    await route.fulfill({ status: 400, json: { message: 'That code is invalid or expired.' } });
  });
  await page.goto('/login');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sparki home' }).locator('img')).toHaveCount(2);
  // Without any loaded stylesheets, HTML dimensions must still bound the logo.
  const fallbackWidths = await page.evaluate(() => {
    const sheets = Array.from(document.styleSheets);
    const disabled = sheets.map((sheet) => sheet.disabled);
    try {
      sheets.forEach((sheet) => { sheet.disabled = true; });
      return Array.from(document.querySelectorAll('[aria-label="Sparki home"] img'))
        .map((image) => image.getBoundingClientRect().width);
    } finally {
      sheets.forEach((sheet, index) => { sheet.disabled = disabled[index]!; });
    }
  });
  expect(fallbackWidths).toHaveLength(2);
  for (const width of fallbackWidths) expect(width).toBeLessThanOrEqual(100);
  await expect(page.getByRole('region', { name: 'Welcome to Sparki' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in with a one-time code' }).click();
  await expect(page.getByRole('region', { name: 'Welcome to Sparki' })).toBeHidden();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('test@example.test');
  await page.getByRole('button', { name: 'Send sign-in code', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await expect(page.getByText('Less chasing.', { exact: false })).toBeHidden();
  const card = await page.locator('.login-card').boundingBox();
  expect(card).not.toBeNull();
  expect(Math.abs(card!.x + card!.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(2);
  const first = page.getByRole('textbox', { name: 'Digit 1 of 6' });
  const verify = page.getByRole('button', { name: 'Verify and sign in' });
  await expect(first).toBeFocused();
  await expect(verify).toBeDisabled();
  await first.pressSequentially('123456');
  await expect(page.getByRole('textbox', { name: 'Digit 6 of 6' })).toHaveValue('6');
  await expect(verify).toBeEnabled();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(page.getByRole('textbox', { name: 'Digit 5 of 6' })).toBeFocused();
  await expect(verify).toBeDisabled();
  await first.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text', '654 321');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }));
  });
  await expect(page.getByRole('textbox', { name: 'Digit 6 of 6' })).toHaveValue('1');
  // Filling the first box with a whole code exercises browser one-time-code autofill.
  await first.fill('654321');
  await expect(verify).toBeEnabled();
  await verify.click();
  await expect(page.getByRole('alert').filter({ hasText: 'That code is invalid or expired.' })).toHaveText('That code is invalid or expired.');
  await expect(first).toHaveAttribute('aria-invalid', 'true');
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.getByRole('textbox', { name: 'Digit 6 of 6' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Back to password sign-in', exact: false }).click();
  await expect(page.getByRole('region', { name: 'Welcome to Sparki' })).toBeVisible();
});

test('switching back with saved credentials never submits password sign-in', async ({ page }) => {
  const attempts: string[] = [];
  await page.route('**/api/auth/**', async (route) => {
    attempts.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 400, json: { message: 'Test sign-in attempt' } });
  });
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('test@example.test');
  await page.getByLabel('Password', { exact: true }).fill('saved-test-password');
  await page.getByRole('button', { name: 'Sign in with a one-time code' }).click();
  await page.getByRole('button', { name: /Sign in with a password instead|Back to password sign-in/ }).click();
  // A subsequent explicit submit gives any unintended earlier request time to arrive.
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('saved-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Test sign-in attempt' })).toBeVisible();
  expect(attempts).toEqual(['/api/auth/login']);
});
