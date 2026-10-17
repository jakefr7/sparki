import { expect, test, type Locator } from '@playwright/test';

// The approved Sparki lockup is the paw mark followed by the wordmark, as in
// the public header. Collapsed navigation keeps the paw mark alone.
async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

test('the app sidebar shows the paw before the wordmark, and the paw alone when collapsed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/patients');

  const brand = page.getByRole('link', { name: 'Sparki dashboard' });
  const paw = brand.locator('img[src*="sparki-mark"]');
  const wordmark = brand.locator('img[src*="sparki-wordmark"]');

  await expect(paw).toBeVisible();
  await expect(wordmark).toBeVisible();
  expect(await brand.locator('img').evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src.includes('sparki-mark') ? 'paw' : 'wordmark'))).toEqual(['paw', 'wordmark']);

  const pawBox = await box(paw);
  const wordmarkBox = await box(wordmark);
  expect(pawBox.height).toBeLessThanOrEqual(34);
  expect(wordmarkBox.height).toBe(34);
  expect(Math.round(wordmarkBox.x - (pawBox.x + pawBox.width))).toBe(10);
  expect(Math.abs((pawBox.y + pawBox.height / 2) - (wordmarkBox.y + wordmarkBox.height / 2))).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect(wordmark).toBeHidden();
  await expect(paw).toBeVisible();
  const collapsedBox = await box(paw);
  expect(collapsedBox.height).toBe(32);

  await page.getByRole('button', { name: 'Expand navigation' }).click();
  await expect(wordmark).toBeVisible();
  await expect(paw).toBeVisible();
});
