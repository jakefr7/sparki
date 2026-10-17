import { expect, test } from '@playwright/test';

// Every linked Sparki logo on the public pages is the approved lockup: the paw
// mark, then the wordmark, side by side.
for (const path of ['/', '/pricing', '/login']) {
  test(`${path} shows the paw before the wordmark in every Sparki logo`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    const logos = page.locator('a[aria-label="Sparki home"]');
    await expect(logos.first()).toBeAttached();

    for (const logo of await logos.all()) {
      const images = await logo.locator('img').evaluateAll((nodes) => nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { kind: (node as HTMLImageElement).src.includes('sparki-mark') ? 'paw' : 'wordmark', left: box.left, right: box.right, middle: box.top + box.height / 2 };
      }));
      expect(images.map((image) => image.kind)).toEqual(['paw', 'wordmark']);
      const [paw, wordmark] = images;
      if (!paw || !wordmark) throw new Error('Expected both paw and wordmark in the logo');
      expect(Math.round(wordmark.left - paw.right)).toBe(10);
      expect(Math.abs(paw.middle - wordmark.middle)).toBeLessThanOrEqual(1);
    }
  });
}
