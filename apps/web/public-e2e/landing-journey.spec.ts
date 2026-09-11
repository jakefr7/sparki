import { expect, test } from '@playwright/test';

test('compact patient journey is keyboard selectable without scrolling through empty screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#top[data-ready="true"]')).toBeAttached();
  const story = page.locator('#product');
  const steps = story.getByRole('button');
  await expect(steps).toHaveCount(8);
  for (const step of await steps.all()) {
    await step.focus();
    await step.press('Enter');
    await expect(step).toHaveAttribute('aria-pressed', 'true');
    await expect(story.locator('button[aria-pressed="true"]')).toHaveCount(1);
  }
  await expect(story.locator('[aria-live="polite"]').getByText('Record review', { exact: true })).toBeVisible();
  await expect(story.locator('[aria-live="polite"]').getByText('The veterinarian reviews and finalizes the record separately from departure.', { exact: true })).toBeVisible();
  const bounds = await story.boundingBox();
  expect(bounds!.height).toBeLessThan(2 * 844);
});
