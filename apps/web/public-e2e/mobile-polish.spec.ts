import { expect, test } from '@playwright/test';

test('landing keeps light browser surfaces and fits narrow mobile screens', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#top[data-ready="true"]')).toBeAttached();
  for (const width of [320, 390, 430, 844, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const surface = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    expect(surface).toEqual({ width, html: 'rgb(247, 251, 251)', body: 'rgb(247, 251, 251)', scheme: 'light' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Illustrative clinic day')).toBeVisible();
  await page.screenshot({ path: '/Users/jna/Documents/Codex/2026-10-07/op/outputs/mobile-landing.png', fullPage: true });
});
